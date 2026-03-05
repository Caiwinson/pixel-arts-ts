# Pixel Arts

<img src="static/icon.png" alt="Pixel Arts icon" width="80" align="right" />

A Discord bot for creating collaborative pixel art canvases with your friends.

This repository is a complete migration from Python to TypeScript, rebuilt from scratch to improve performance, maintainability, and long-term scalability.

## Features

- **Create Canvases** — Use `/create canvas` to start a new canvas from 5×5 up to 15×15. Unlock 20×20 and 25×25 by voting.
- **Collaborate** — Invite friends to draw on the same canvas in real-time.
- **Recreate Images** — Transform any image into an editable pixel art canvas using `/recreate` _(vote required)_.
- **Timelapse** — Generate a speed-adjustable timelapse video of your canvas's evolution.
- **Advanced Tools** — Line drawing, rectangle, fill, and color replacement tools for complex designs.
- **Custom Colors** — Unlock any hex color by voting on Top.gg.

## Commands

| Command          | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `/create canvas` | Start a new pixel art canvas                               |
| `/recreate`      | Convert an image into an editable canvas _(vote required)_ |
| `/help`          | Show all commands and features                             |
| `/vote`          | Vote on Top.gg to unlock premium features                  |
| `/invite`        | Get the invite link for Pixel Arts                         |

## Getting Started

### Prerequisites

- Docker
- Docker Compose

### Installation

1. Copy the example environment file and fill in your values:

    ```bash
    cp .env.example .env
    ```

    The `.env` file requires the following variables:

    | Variable            | Description                                                   |
    | ------------------- | ------------------------------------------------------------- |
    | `DISCORD_TOKEN`     | Bot token from the Discord Developer Portal                   |
    | `TOPGG_TOKEN`       | Top.gg API token for posting server stats                     |
    | `TOPGG_WEBHOOK`     | Webhook secret for verifying vote payloads                    |
    | `WEBHOOK_URL`       | _(Optional)_ Discord webhook for logging new canvases         |
    | `DOMAIN_URL`        | Public-facing base URL of the web service (no trailing slash) |
    | `POSTGRES_USER`     | PostgreSQL username                                           |
    | `POSTGRES_PASSWORD` | PostgreSQL password                                           |
    | `POSTGRES_DB`       | PostgreSQL database name                                      |

2. Create a `docker-compose.yml` file:

    ```yaml
    services:
        db:
            image: postgres:16-alpine
            restart: unless-stopped
            environment:
                POSTGRES_USER: ${POSTGRES_USER}
                POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
                POSTGRES_DB: ${POSTGRES_DB}
            volumes:
                - ./data/postgres:/var/lib/postgresql/data
            healthcheck:
                test:
                    [
                        "CMD-SHELL",
                        "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}",
                    ]
                interval: 10s
                timeout: 5s
                retries: 5

        web:
            image: ghcr.io/caiwinson/pixel-arts:latest
            restart: unless-stopped
            env_file: .env
            environment:
                APP_MODE: web
            ports:
                - "8080:8080"
            volumes:
                - ./data:/app/data
            depends_on:
                db:
                    condition: service_healthy

        bot:
            image: ghcr.io/caiwinson/pixel-arts:latest
            restart: unless-stopped
            env_file: .env
            environment:
                APP_MODE: bot
            volumes:
                - ./data:/app/data
            depends_on:
                db:
                    condition: service_healthy
                web:
                    condition: service_started
    ```

3. Start all services:

    ```bash
    docker-compose up -d
    ```

### Development

```bash
npm install
npm run dev
```

To build for production:

```bash
npm run build
npm start
```

## Usage

1. **Create a Canvas** — Run `/create canvas` and choose a size.
2. **Draw** — Click the grid buttons to fill pixels with your selected color.
3. **Advanced Canvases** — On larger canvases, use the X/Y selectors then hit **Place Pixel**.
4. **Tools** — Open the Tool menu for line, fill, rectangle, outline, and color replacement.
5. **Undo** — Undo your last placement (up to 3 times per minute).
6. **Close & Timelapse** — Close the canvas and press **Timelapse** to generate a replay video.
7. **Recreate** — Use `/recreate` to turn any image into an editable canvas _(vote required)_.

## Links

- [Website](https://pixel-arts.caiwinson.space)
- [Invite the Bot](https://top.gg/bot/1008692736720908318/invite)
- [Support Server](https://discord.gg/ErBJ7JTUYe)
- [Vote on Top.gg](https://top.gg/bot/1008692736720908318/vote)
