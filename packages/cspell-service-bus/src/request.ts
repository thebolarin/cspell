export interface ServiceRequest<T extends string = string, P = unknown, R = unknown> {
    readonly type: T;
    readonly params: P;
    __r?: ServiceResponseBase<R>;
}

class BaseServiceRequest<T extends string, P, R> implements ServiceRequest<T, P, R> {
    readonly __r?: ServiceResponseBase<R>;
    constructor(
        readonly type: T,
        readonly params: P,
    ) {}
}

export class ServiceRequestCls<T extends string, P, R> extends BaseServiceRequest<T, P, R> {
    constructor(type: T, params: P) {
        super(type, params);
    }
}

interface ServiceResponseBase<T> {
    ___T?: T;
    value?: T;
    error?: Error | undefined;
}

export interface ServiceResponseSuccess<T> extends ServiceResponseBase<T> {
    value: T;
    error?: undefined;
}

export interface ServiceResponseFailure<T> extends ServiceResponseBase<T> {
    error: Error;
}

export type ServiceResponse<T> = ServiceResponseSuccess<T> | ServiceResponseFailure<T>;

export type IsARequest<T extends ServiceRequest> = (r: ServiceRequest) => r is T;

export function createResponse<R extends ServiceRequest, T = RequestResponseType<R>>(
    value: T,
    _req?: R,
): ServiceResponseSuccess<T> {
    return { value };
}

type VT<T> = T extends { ___T?: infer R } ? R : never;

export type RequestResponseType<T> = T extends { __r?: infer R } ? R : never;

export function createResponseFail<R extends ServiceRequest, E extends Error>(
    _request: R,
    error: E,
): ServiceResponseFailure<VT<RequestResponseType<R>>> {
    return { error };
}

export function isServiceResponseSuccess<T>(res: ServiceResponseBase<T>): res is ServiceResponseSuccess<T> {
    return 'value' in res && (<ServiceResponseFailure<T>>res).error === undefined;
}

export function isServiceResponseFailure<T>(res: ServiceResponseBase<T>): res is ServiceResponseFailure<T> {
    return (<ServiceResponseFailure<T>>res).error !== undefined;
}

export function isInstanceOfFn<T>(constructor: { new (): T }): (t: unknown) => t is T {
    return (t): t is T => t instanceof constructor;
}

export const __testing__: {
    BaseServiceRequest: typeof BaseServiceRequest;
} = {
    BaseServiceRequest,
};
