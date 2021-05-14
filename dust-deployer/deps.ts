export * as YAML from 'https://deno.land/std@0.95.0/encoding/yaml.ts';
export * as flags from "https://deno.land/std@0.95.0/flags/mod.ts";
export * as clr from 'https://deno.land/std@0.95.0/fmt/colors.ts';
export {
  iter,
} from 'https://deno.land/std@0.95.0/io/util.ts';
export {
  readableStreamFromReader, readerFromIterable,
} from 'https://deno.land/std@0.95.0/io/streams.ts';
export {
  join as pathJoin,
  basename as pathBasename,
  dirname as pathDirname,
} from "https://deno.land/std@0.95.0/path/mod.ts";

export { autoDetectClient } from "https://deno.land/x/kubernetes_client@v0.2.4/mod.ts";
export type { JSONObject } from "https://deno.land/x/kubernetes_client@v0.2.4/mod.ts";
export { fromIngress } from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/networking.k8s.io@v1beta1/structs.ts";
export { fromDeployment } from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/apps@v1/structs.ts";
export type { DeploymentSpec } from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/apps@v1/structs.ts";
export type { PodSpec, Container } from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/core@v1/structs.ts";

export { combine } from 'https://crux.land/7Ed9a6#combine-iterators@v1';
