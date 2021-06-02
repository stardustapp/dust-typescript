FROM denoland/deno:alpine-1.10.3
WORKDIR /src

ADD . ./
RUN deno cache automaton-lua/app.ts
# CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--cached-only", "app.ts"]
