/**
 * The SigV4 signer against published vectors:
 *
 * - The AWS SigV4 test suite (service "service", us-east-1,
 *   2015-08-30T12:36:00Z), as kept in
 *   https://github.com/awslabs/aws-c-auth/tree/main/tests/aws-signing-test-suite/v4
 *   Only cases that match S3's rules (encode the path once, no
 *   normalization) are used.
 * - The worked examples in the S3 API reference:
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_PAYLOAD_SHA256,
  presignUrl,
  sha256Hex,
  signHeaders,
  UNSIGNED_PAYLOAD,
  uriEncode,
} from "./sigv4";

const SUITE_CREDENTIALS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const SUITE_SCOPE = { region: "us-east-1", service: "service" };
const SUITE_NOW = new Date("2015-08-30T12:36:00Z");
const SUITE_HOST = "example.amazonaws.com";
const SUITE_EXPIRES = 3600;

interface SuiteCase {
  headerSignature: string;
  headers?: Record<string, string>;
  method: string;
  name: string;
  path: string;
  query?: Record<string, string>;
  querySignature: string;
}

const UNRESERVED_CHARS =
  "-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SUITE: SuiteCase[] = [
  {
    name: "get-vanilla",
    method: "GET",
    path: "/",
    headerSignature:
      "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    querySignature:
      "e93c787ed7f371d5c6b165c1b38ede9550f4dce4144713e844b25b7192d3865d",
  },
  {
    name: "get-unreserved",
    method: "GET",
    path: `/${UNRESERVED_CHARS}`,
    headerSignature:
      "07ef7494c76fa4850883e2b006601f940f8a34d404d0cfa977f52a65bbf5f24f",
    querySignature:
      "95968482db1b9e0fadef6efc1bd24689f77c77d9ef56919c96a28cc92e0d6005",
  },
  {
    name: "get-utf8",
    method: "GET",
    path: "/ሴ",
    headerSignature:
      "8318018e0b0f223aa2bbf98705b62bb787dc9c0e678f255a891fd03141be5d85",
    querySignature:
      "10eae3f14a260bd3911cc6d008d3c576d143b05b62f09782a7a4b37f52178e44",
  },
  {
    name: "get-space-unnormalized",
    method: "GET",
    path: "/example space/",
    headerSignature:
      "652487583200325589f1fba4c7e578f72c47cb61beeca81406b39ddec1366741",
    querySignature:
      "7a1f416954786484c9824d93c1f26ef64acb9b1b6c9154d08c9f07d0e394abf6",
  },
  {
    name: "get-slashes-unnormalized",
    method: "GET",
    path: "//example//",
    headerSignature:
      "87cca117541a147f6df867677d98a7d80dff226d2bfca9e4ffa899665623c7e5",
    querySignature:
      "822a5a9ba28072c5ab2bb4a6307d0c88276d40e49fec6b724c03fb4d4ba60fc2",
  },
  {
    name: "get-vanilla-query-order-key-case",
    method: "GET",
    path: "/",
    query: { Param2: "value2", Param1: "value1" },
    headerSignature:
      "b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500",
    querySignature:
      "86012e2c9ad4d77369f5d81c11f75158aae4f895a085212cc6d3f923d300bed5",
  },
  {
    name: "get-vanilla-utf8-query",
    method: "GET",
    path: "/",
    query: { ሴ: "bar" },
    headerSignature:
      "2cdec8eed098649ff3a119c94853b13c643bcf08f8b0a1d91e12c9027818dd04",
    querySignature:
      "0bdd809b1519ac4f0c1dc3540e2cc46bd0c7f778eda408b2ebf3b913d21ff600",
  },
  {
    name: "get-vanilla-query-unreserved",
    method: "GET",
    path: "/",
    query: { [UNRESERVED_CHARS]: UNRESERVED_CHARS },
    headerSignature:
      "9c3e54bfcdf0b19771a7f523ee5669cdf59bc7cc0884027167c21bb143a40197",
    querySignature:
      "8e76a88a7433637b12778d5592799b29ad21ecd6cf6325051c21d86f0acda2bf",
  },
  {
    name: "get-header-value-trim",
    method: "GET",
    path: "/",
    headers: { "My-Header1": " value1", "My-Header2": ' "a   b   c"' },
    headerSignature:
      "acc3ed3afb60bb290fc8d2dd0098b9911fcaa05412b367055dee359757a9c736",
    querySignature:
      "e7bb0fd515e125e1aec2ecc4c0c17484fb06f6846b927c35e46005dd3df3acd4",
  },
  {
    name: "post-header-key-sort",
    method: "POST",
    path: "/",
    headers: { "My-Header1": "value1" },
    headerSignature:
      "c5410059b04c1ee005303aed430f6e6645f61f4dc9e1461ec8f8916fdf18852c",
    querySignature:
      "c09d07e0d55871f10f2a6d350d994acf6825a3cae70673d7def55616e6119dd7",
  },
  {
    name: "post-vanilla",
    method: "POST",
    path: "/",
    headerSignature:
      "5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b",
    querySignature:
      "2ce6e6d2e0cf2f9d1b55fafec88cd20574c31dc2e7631979f71ba2310083e95b",
  },
];

describe("SigV4 test suite", () => {
  it.each(SUITE)("$name: header signature", (testCase) => {
    const signed = signHeaders(
      {
        method: testCase.method,
        host: SUITE_HOST,
        path: testCase.path,
        query: testCase.query,
        headers: testCase.headers,
      },
      SUITE_CREDENTIALS,
      SUITE_SCOPE,
      { now: SUITE_NOW }
    );
    expect(signed.signature).toBe(testCase.headerSignature);
  });

  it.each(SUITE)("$name: query signature", (testCase) => {
    const signed = presignUrl(
      {
        method: testCase.method,
        host: SUITE_HOST,
        path: testCase.path,
        query: testCase.query,
        headers: testCase.headers,
      },
      SUITE_CREDENTIALS,
      SUITE_SCOPE,
      { now: SUITE_NOW, expiresInSeconds: SUITE_EXPIRES }
    );
    expect(signed.signature).toBe(testCase.querySignature);
  });

  it("get-vanilla: canonical request, string to sign and Authorization header", () => {
    const signed = signHeaders(
      { method: "GET", host: SUITE_HOST, path: "/" },
      SUITE_CREDENTIALS,
      SUITE_SCOPE,
      { now: SUITE_NOW }
    );
    expect(signed.canonicalRequest).toBe(
      [
        "GET",
        "/",
        "",
        "host:example.amazonaws.com",
        "x-amz-date:20150830T123600Z",
        "",
        "host;x-amz-date",
        EMPTY_PAYLOAD_SHA256,
      ].join("\n")
    );
    expect(signed.stringToSign).toBe(
      [
        "AWS4-HMAC-SHA256",
        "20150830T123600Z",
        "20150830/us-east-1/service/aws4_request",
        "bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63",
      ].join("\n")
    );
    expect(signed.headers).toEqual({
      "x-amz-date": "20150830T123600Z",
      authorization:
        "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    });
  });
});

const S3_CREDENTIALS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const S3_SCOPE = { region: "us-east-1", service: "s3" };
const S3_NOW = new Date("2013-05-24T00:00:00Z");
const S3_HOST = "examplebucket.s3.amazonaws.com";
const ONE_DAY_SECONDS = 86_400;

describe("S3 documentation examples", () => {
  it("presigned GET of test.txt (query-string auth)", () => {
    const signed = presignUrl(
      {
        method: "GET",
        host: S3_HOST,
        path: "/test.txt",
        payloadHash: UNSIGNED_PAYLOAD,
      },
      S3_CREDENTIALS,
      S3_SCOPE,
      { now: S3_NOW, expiresInSeconds: ONE_DAY_SECONDS }
    );
    expect(signed.signature).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
    expect(signed.pathAndQuery).toBe(
      "/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
    );
  });

  it("GET object with a Range header (header auth)", () => {
    const signed = signHeaders(
      {
        method: "GET",
        host: S3_HOST,
        path: "/test.txt",
        headers: {
          range: "bytes=0-9",
          "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256,
        },
      },
      S3_CREDENTIALS,
      S3_SCOPE,
      { now: S3_NOW }
    );
    expect(signed.signature).toBe(
      "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    );
  });

  it("PUT object with a body and a $ in the key (header auth)", () => {
    const body = "Welcome to Amazon S3.";
    const payloadHash = sha256Hex(body);
    expect(payloadHash).toBe(
      "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072"
    );
    const signed = signHeaders(
      {
        method: "PUT",
        host: S3_HOST,
        path: "/test$file.text",
        payloadHash,
        headers: {
          date: "Fri, 24 May 2013 00:00:00 GMT",
          "x-amz-storage-class": "REDUCED_REDUNDANCY",
          "x-amz-content-sha256": payloadHash,
        },
      },
      S3_CREDENTIALS,
      S3_SCOPE,
      { now: S3_NOW }
    );
    expect(signed.signature).toBe(
      "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd"
    );
  });

  it("GET bucket lifecycle (a query key with no value)", () => {
    const signed = signHeaders(
      {
        method: "GET",
        host: S3_HOST,
        path: "/",
        query: { lifecycle: "" },
        headers: { "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256 },
      },
      S3_CREDENTIALS,
      S3_SCOPE,
      { now: S3_NOW }
    );
    expect(signed.signature).toBe(
      "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543"
    );
  });

  it("list objects with max-keys and prefix", () => {
    const signed = signHeaders(
      {
        method: "GET",
        host: S3_HOST,
        path: "/",
        query: { "max-keys": "2", prefix: "J" },
        headers: { "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256 },
      },
      S3_CREDENTIALS,
      S3_SCOPE,
      { now: S3_NOW }
    );
    expect(signed.signature).toBe(
      "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"
    );
  });
});

describe("uriEncode and limits", () => {
  it("keeps only unreserved characters; slashes only in paths", () => {
    expect(uriEncode("a b+c/d~e", false)).toBe("a%20b%2Bc/d~e");
    expect(uriEncode("a/b")).toBe("a%2Fb");
    expect(uriEncode("é")).toBe("%C3%A9");
  });

  it("refuses expiries outside 1 second to 7 days", () => {
    const request = { method: "GET", host: S3_HOST, path: "/x" };
    expect(() =>
      presignUrl(request, S3_CREDENTIALS, S3_SCOPE, {
        now: S3_NOW,
        expiresInSeconds: 0,
      })
    ).toThrow(RangeError);
    expect(() =>
      presignUrl(request, S3_CREDENTIALS, S3_SCOPE, {
        now: S3_NOW,
        expiresInSeconds: 604_801,
      })
    ).toThrow(RangeError);
  });
});
