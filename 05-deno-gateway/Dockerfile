FROM denoland/deno:latest

WORKDIR /app

# Copy dependency configuration first to improve Docker layer caching.
COPY deno.json ./

# Copy application source files.
COPY src ./src
COPY static ./static

# Cache and validate the application dependencies during the image build.
RUN deno cache src/main.ts

# The gateway listens on port 6910 by default.
EXPOSE 6910

# Do not store secrets in the image.
# They must be provided at runtime through environment variables.
CMD ["task", "start"]
