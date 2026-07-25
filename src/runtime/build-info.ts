declare const __BUILD_GIT_SHA__: string | undefined;
declare const __BUILD_SHORT_GIT_SHA__: string | undefined;
declare const __BUILD_RELEASE_ID__: string | undefined;
declare const __BUILD_TIMESTAMP__: string | undefined;
declare const __BUILD_VERSION__: string | undefined;

export const BUILD_INFO = {
  gitSha: typeof __BUILD_GIT_SHA__ === "string" ? __BUILD_GIT_SHA__ : "development",
  shortGitSha:
    typeof __BUILD_SHORT_GIT_SHA__ === "string"
      ? __BUILD_SHORT_GIT_SHA__
      : "development",
  releaseId:
    typeof __BUILD_RELEASE_ID__ === "string"
      ? __BUILD_RELEASE_ID__
      : "release-development",
  buildTimestamp:
    typeof __BUILD_TIMESTAMP__ === "string" ? __BUILD_TIMESTAMP__ : "development",
  version: typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "0.1.0"
} as const;
