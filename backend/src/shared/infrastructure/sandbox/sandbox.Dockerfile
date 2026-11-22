# The image the commands of a repository run in: Node, and the ps program.
# The mutation tool ends its test runners through ps, and the slim image
# of Node leaves it out, so a run of the tool ended there with no report.
FROM node:26-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
