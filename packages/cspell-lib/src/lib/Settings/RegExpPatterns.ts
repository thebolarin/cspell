// Exclude Expressions
// cSpell:ignore anrvtbf
export const regExMatchUrls: RegExp = /(?:https?|ftp):\/\/[^\s"]+/gi;
export const regExHRef: RegExp = /\bhref\s*=\s*".*?"/gi;
export const regExMatchCommonHexFormats: RegExp =
    /(?:#[0-9a-f]{3,8})|(?:0x[0-9a-f]+)|(?:\\u[0-9a-f]{4})|(?:\\x\{[0-9a-f]{4}\})/gi;
export const regExCommitHash: RegExp = /\b(?![a-f]+\b)(?:0x)?[0-9a-f]{7,}\b/gi; // Match Commit Hashes that contain at least one digit.
export const regExCommitHashLink: RegExp = /\[[0-9a-f]{7,}\]/gi; // Match Commit Hash Markdown link: [abcdef0].
export const regExCStyleHexValue: RegExp = /\b0x[0-9a-f_]+\b/gi;
export const regExCSSHexValue: RegExp = /#[0-9a-f]{3,8}\b/gi;
export const regExUUID: RegExp = /\b[0-9a-fx]{8}-[0-9a-fx]{4}-[0-9a-fx]{4}-[0-9a-fx]{4}-[0-9a-fx]{12}\b/gi; // x - represents placeholder values
export const regExUnicodeRef: RegExp = /\bU\+[0-9a-f]{4,5}(?:-[0-9a-f]{4,5})?/gi;
export const regExSpellingGuardBlock: RegExp =
    /(\bc?spell(?:-?checker)?::?)\s*disable(?!-line|-next)\b(?!-)[\s\S]*?((?:\1\s*enable\b)|$)/gi;
export const regExSpellingGuardNext: RegExp = /\bc?spell(?:-?checker)?::?\s*disable-next\b.*\s\s?.*/gi;
export const regExSpellingGuardLine: RegExp = /^.*\bc?spell(?:-?checker)?::?\s*disable-line\b.*/gim;
export const regExIgnoreSpellingDirectives: RegExp = /\bc?spell(?:-?checker)?::?\s*ignoreRegExp.*/gim;
export const regExPublicKey: RegExp = /-{5}BEGIN\s+((?:RSA\s+)?PUBLIC\s+KEY)[\w=+\-/=\\\s]+?END\s+\1-{5}/g;
export const regExCert: RegExp =
    /-{5}BEGIN\s+(CERTIFICATE|(?:RSA\s+)?(?:PRIVATE|PUBLIC)\s+KEY)[\w=+\-/=\\\s]+?END\s+\1-{5}/g;
export const regExSshRSA: RegExp = /ssh-rsa\s+[a-z0-9/+]{28,}={0,3}(?![a-z0-9/+=])/gi;
export const regExEscapeCharacters: RegExp = /\\(?:[anrvtbf]|[xu][a-f0-9]+)/gi;
export const regExBase64: RegExp =
    /(?<![A-Za-z0-9/+])(?:[A-Za-z0-9/+]{40,})(?:\s^\s*[A-Za-z0-9/+]{40,})*(?:\s^\s*[A-Za-z0-9/+]+=*)?(?![A-Za-z0-9/+=])/gm;

/**
 * Detect a string of characters that look like a Base64 string.
 *
 * It must be:
 * - at least 40 characters
 * - preceded by a non-Base64
 * - contain at least 1 of [0-9+/]
 * - contain at least 1 of [A-Z][a-z][A-Z]
 * - contain at least 1 of [A-Z][0-9][A-Z] | [a-z][0-9][a-z] | [A-Z][0-9][a-z] | [0-9][A-Za-z][0-9]
 * - contain at least 1 of [a-z]{3} | [A-Z]{3}
 */
export const regExBase64SingleLine: RegExp =
    /(?<=[^A-Za-z0-9/+_]|^)(?=[A-Za-z]{0,80}[0-9+/])(?=[A-Za-z0-9/+]{0,80}?[A-Z][a-z][A-Z])(?=[A-Za-z0-9/+]{0,80}?(?:[A-Z][0-9][A-Z]|[a-z][0-9][a-z]|[A-Z][0-9][a-z]|[a-z][0-9][A-Z]|[0-9][A-Za-z][0-9]))(?=[A-Za-z0-9/+]{0,80}?(?:[a-z]{3}|[A-Z]{3}))(?:[A-Za-z0-9/+]{40,})=*/gm;

export const regExBase64SingleLineLegacy: RegExp =
    /((?<![A-Za-z0-9/+]))(?=[A-Za-z]{0,80}[0-9])(?:[A-Za-z0-9/+]{4}){10,}(?:[A-Za-z0-9/+]{3}={1}|[A-Za-z0-9/+]{2}={2}|[A-Za-z0-9/+]{1}={3})?(?![A-Za-z0-9/+=])(?=\1)/gm;

export const regExBase64MultiLine: RegExp =
    /(?<![A-Za-z0-9/+])["']?(?:[A-Za-z0-9/+]{40,})["']?(?:\s^\s*["']?[A-Za-z0-9/+]{40,}["']?)+(?:\s^\s*["']?[A-Za-z0-9/+]+={0,3}["']?)?(?![A-Za-z0-9/+=])/gm;

// cspell:ignore aeiou
// The following is an attempt at detecting random strings.
// export const regExRandomString =
//     /\b(?=\w*(?:[A-Z]{2}|[A-Z][a-z][A-Z]|\d\w\d))(?=(?:\w*[A-Z]){2})(?=(?:\w*[a-z]){2})(?=\w*[^aeiouAEIOU\W]{4})[\w]{10,}\b/g;

// Include Expressions
export const regExPhpHereDoc: RegExp = /<<<['"]?(\w+)['"]?[\s\S]+?^\1;/gm;
export const regExString: RegExp = /(?:(['"]).*?(?<![^\\]\\(\\\\)*)\1)|(?:`[\s\S]*?(?<![^\\]\\(\\\\)*)`)/g;

// Note: the C Style Comments incorrectly considers '/*' and '//' inside of strings as comments.
export const regExCStyleComments: RegExp = /(?<!\w:)(?:\/\/.*)|(?:\/\*[\s\S]*?\*\/)/g;
export const rexExPythonStyleComments: RegExp = /#.*|(?:('''|""")[\s\S]+?\1)/gm;

export const regExEmail: RegExp = /<?\b[\w.\-+]{1,128}@\w{1,63}(\.\w{1,63}){1,4}\b>?/gi;

export const regExRepeatedChar: RegExp = /^(\w)\1{3,}$/i;

export const regExSha: RegExp = /\bsha\d+-[a-z0-9+/]{25,}={0,3}/gi;

/**
 * Detect common hash strings like:
 * - `sha1`, `sha256`, `sha512`
 * - `md5`
 * - `base64` - used in email
 * - `crypt`, `bcrypt`, `script`
 * - `token`
 * - `assertion` - use with jwt
 */
export const regExHashStrings: RegExp =
    /(?:\b(?:sha\d+|md5|base64|crypt|bcrypt|scrypt|security-token|assertion)[-,:$=]|#code[/])[-\w/+%.]{25,}={0,3}(?:(['"])\s*\+?\s*\1?[-\w/+%.]+={0,3})*(?![-\w/+=%.])/gi;
