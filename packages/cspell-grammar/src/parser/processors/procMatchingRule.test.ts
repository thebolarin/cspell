import assert from 'node:assert';

import { describe, expect, test } from 'vitest';

import type { GrammarDef } from '../grammarDefinition.js';
import { normalizeGrammar } from '../grammarNormalizer.js';
import { ScopePool } from '../scope.js';
import type { TokenizedText } from '../types.js';
import { applyCaptureToBeginOrMatch } from './procMatchingRule.js';

const oc = (...params: Parameters<typeof expect.objectContaining>) => expect.objectContaining(...params);

const pool = new ScopePool();

const grammar: GrammarDef = {
    scopeName: 'source.tst',
    patterns: [
        {
            match: /([ \t]+)?((\/\/)(?:\s*((@)internal)(?=\s|$))?)(.*)/,
            captures: {
                '1': {
                    name: 'punctuation.whitespace.comment.leading.ts',
                },
                '2': {
                    name: 'comment.line.double-slash.ts',
                },
                '3': {
                    name: 'punctuation.definition.comment.ts',
                },
                '4': {
                    name: 'storage.type.internal-declaration.ts',
                },
                '5': {
                    name: 'punctuation.decorator.internal-declaration.ts',
                },
                '6': {
                    name: 'comment.line.double-slash.ts',
                },
            },
        },
        {
            match: /#.*/,
            captures: {
                '0': 'comment.line.hash.tst',
            },
        },
    ],
};

const sTest = {
    single_line_comment: {
        text: "const x = 'hello'; // a Comment.",
        offset: 0,
        expected: [
            s(['punctuation.whitespace.comment.leading.ts', 'source.tst']),
            s(['punctuation.definition.comment.ts', 'comment.line.double-slash.ts', 'source.tst']),
            s(['comment.line.double-slash.ts', 'source.tst']),
        ],
        comment: 'single_line_comment',
    },
};

describe('procMatchingRule', () => {
    test.each`
        text                                 | offset | expected                                        | comment
        ${"const x = 'hello'; # a Comment."} | ${0}   | ${[s(['comment.line.hash.tst', 'source.tst'])]} | ${''}
        ${sTest.single_line_comment.text}    | ${0}   | ${sTest.single_line_comment.expected}           | ${sTest.single_line_comment.comment}
    `('applyCaptures $text $comment', ({ text, offset, expected }) => {
        const m = match(text, offset);
        assert(m);
        expect(applyCaptureToBeginOrMatch(m)).toEqual(expected);
    });
});

function s(scope: string[]): TokenizedText {
    return oc({ scope: pool.parseScope(scope) });
}

function match(text: string, offset = 0, lineNumber = 42, anchor = -1) {
    const g = normalizeGrammar(grammar);
    const rule = g.begin(undefined);
    return rule.findNext({ text, offset, anchor, lineNumber });
}
