export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type JsonObject = {[key:string]:Json};
export function projectExport(exported:unknown, issuedAt:string): JsonObject;
export function validatePacket(packet:unknown, now:number): JsonObject;
export function reviewPacket(packet:unknown, evaluatedAt:string): JsonObject;
export function validateDelivery(body:unknown, now:number): JsonObject;
export function canonical(value:unknown): string;
export function digest(value:unknown): string;
