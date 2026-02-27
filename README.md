# Pixel Arts

A simple discord bot for creating pixel arts

This repository is a complete migration from Python to JavaScript, rebuilt from scratch to improve performance, maintainability, and long-term scalability.

## Features

- **Create Canvases:** Use the `/create canvas` command to start a new 5x5 or 15x15 canvas.
- **Collaborate:** Invite your friends to draw on the same canvas in real-time.
- **Recreate Images:** Transform images into editable pixel art canvases using the `/recreate` command.
- **Timelapse:** Generate a timelapse video of your canvas's evolution over time.
- **Advanced Tools:** Use tools like line drawing, fill, and color replacement for complex designs.
- **Custom Colors:** Unlock custom colors by voting for the bot.

## Getting Started

### Prerequisites

- Docker
- Docker Compose

### Installation

1.  Create a `docker-compose.yml` file:

    ```yaml
    services:
      pixel-arts:
        image: ghcr.io/caiwinson/pixel-arts:latest
        ports:
          - "8000:8000"
        env_file:
          - .env
        volumes:
          - ./data:/app/data
        restart: unless-stopped
    ```

2.  Ensure you have the required configuration files in the root directory:
    - `.env`: Environment variables.
3.  Run the container using Docker Compose:

    ```bash
    docker-compose up -d
    ```

## Usage

1.  **Create a Canvas:** Run the `/create canvas` command to generate a blank canvas.
2.  **Draw:** Click on the buttons in the grid to fill pixels with your selected color.
3.  **Recreate:** Use the `/recreate` command to turn an image into a canvas and start editing.

## Links

- [Website](https://pixel-arts.caiwinson.space)
- [Invite the Bot](https://top.gg/bot/1008692736720908318/)
