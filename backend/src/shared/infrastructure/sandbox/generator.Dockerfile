# The image the generator runs in: Node and the CLI, at the version the
# command line of the service was measured with. The tag of the image the
# service builds from this file names the same version.
FROM node:26-slim

RUN npm install --global @anthropic-ai/claude-code@2.1.329 \
    && npm cache clean --force
