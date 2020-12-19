#!/bin/sh -eux
UtilsDir="$(dirname "$(readlink -f "$0")")"

deno install -f --allow-net --allow-env "$UtilsDir"/starcli.ts
deno install -f --allow-net --allow-env "$UtilsDir"/starcp.ts
deno install -f --allow-net --allow-env "$UtilsDir"/starop.ts
