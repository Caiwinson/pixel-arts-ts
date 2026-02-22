import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
} from "discord.js";

import type { Interaction } from "discord.js";

interface PixelButton {
  customId: string;
  label: string;
  style: ButtonStyle;
}

// Generate a row of buttons
function createCanvasRow(
  start: number,
  end: number,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = start; i < end; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(i.toString())
        .setLabel("⠀") // invisible space
        .setStyle(ButtonStyle.Secondary), // gray button
    );
  }
  return row;
}

export function createCanvasView(): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let id = 0;

  for (let y = 0; y < 5; y++) {
    // Each row has 5 buttons
    rows.push(createCanvasRow(id, id + 5));
    id += 5;
  }

  return rows;
}