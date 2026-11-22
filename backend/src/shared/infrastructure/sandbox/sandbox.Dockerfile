# The image the commands of a repository run in: Node, the ps program,
# git and Corepack. The mutation tool ends its test runners through ps, and
# the slim image of Node leaves it out, so a run of the tool ended there
# with no report. The install of a trusted repository fetches a package
# from a git repository with git, over https only: the certificates are
# for https, and no ssh client is in the image, as the sandbox holds no
# key. Node 26 no longer ships Corepack, which fetches the exact pnpm or
# yarn a repository names while its install has the network. No manager
# is in the image, so nothing after the install can start one.
FROM node:26-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends procps git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global corepack@0.36.0 \
    && npm cache clean --force
