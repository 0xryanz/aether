"use client";

export type PosterData = {
  address: string;
  mined: string;
  claimable: string;
  weight: string;
  looms: number;
  invites: number;
  referralLink: string;
  rank?: number | null;
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export async function renderPoster(data: PosterData): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
  bg.addColorStop(0, "#08060b");
  bg.addColorStop(0.55, "#0d0912");
  bg.addColorStop(1, "#120b09");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1350);

  glow(ctx, 880, 120, 420, "rgba(139,92,246,0.28)");
  glow(ctx, 120, 1220, 480, "rgba(255,107,44,0.22)");
  glow(ctx, 540, 500, 380, "rgba(243,196,139,0.10)");

  // Grain
  for (let i = 0; i < 1400; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    ctx.fillRect(Math.random() * 1080, Math.random() * 1350, 1.4, 1.4);
  }

  // Frame
  ctx.strokeStyle = "rgba(243,196,139,0.28)";
  ctx.lineWidth = 2;
  roundedRect(ctx, 52, 52, 976, 1246, 34);
  ctx.stroke();
  ctx.strokeStyle = "rgba(243,196,139,0.10)";
  ctx.lineWidth = 1;
  roundedRect(ctx, 68, 68, 944, 1214, 26);
  ctx.stroke();

  // Brand
  ctx.fillStyle = "#f3c48b";
  ctx.font = "600 40px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText("AETHER", 108, 158);
  ctx.font = "500 15px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "rgba(243,196,139,0.62)";
  ctx.fillText("F O R G E", 108, 186);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(245,240,232,0.42)";
  ctx.font = "15px ui-monospace, Menlo, monospace";
  ctx.fillText("MINING RECEIPT", 972, 160);
  ctx.fillStyle = "rgba(245,240,232,0.3)";
  ctx.font = "13px ui-monospace, Menlo, monospace";
  ctx.fillText(new Date().toISOString().slice(0, 10), 972, 184);

  // Divider
  const line = ctx.createLinearGradient(108, 0, 972, 0);
  line.addColorStop(0, "rgba(243,196,139,0)");
  line.addColorStop(0.5, "rgba(243,196,139,0.45)");
  line.addColorStop(1, "rgba(243,196,139,0)");
  ctx.fillStyle = line;
  ctx.fillRect(108, 226, 864, 1);

  // Title
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(245,240,232,0.62)";
  ctx.font = "16px ui-monospace, Menlo, monospace";
  ctx.fillText("TOTAL MINED", 108, 306);

  const minedGradient = ctx.createLinearGradient(108, 0, 860, 0);
  minedGradient.addColorStop(0, "#f7d9ae");
  minedGradient.addColorStop(0.55, "#ff9a5a");
  minedGradient.addColorStop(1, "#a78bfa");
  ctx.fillStyle = minedGradient;
  ctx.font = "500 118px Georgia, 'Times New Roman', serif";
  ctx.fillText(data.mined, 104, 420);
  ctx.fillStyle = "rgba(245,240,232,0.55)";
  ctx.font = "22px ui-monospace, Menlo, monospace";
  ctx.fillText("$AETHER", 110, 460);

  // Stats grid
  const cells = [
    { label: "UNCLAIMED", value: data.claimable, suffix: "AETHER" },
    { label: "WEIGHT", value: data.weight, suffix: "W" },
    { label: "LOOMS", value: String(data.looms), suffix: "NFT" },
    { label: "INVITES", value: String(data.invites), suffix: "VALID" },
  ];

  cells.forEach((cell, index) => {
    const x = 108 + (index % 2) * 438;
    const y = 540 + Math.floor(index / 2) * 152;
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    roundedRect(ctx, x, y, 408, 128, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(243,196,139,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(245,240,232,0.4)";
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.fillText(cell.label, x + 26, y + 40);

    ctx.fillStyle = "#f5f0e8";
    ctx.font = "500 44px Georgia, 'Times New Roman', serif";
    ctx.fillText(cell.value, x + 26, y + 94);

    const valueWidth = ctx.measureText(cell.value).width;
    ctx.fillStyle = "rgba(243,196,139,0.6)";
    ctx.font = "13px ui-monospace, Menlo, monospace";
    ctx.fillText(cell.suffix, x + 34 + valueWidth, y + 94);
  });

  // Referral block
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  roundedRect(ctx, 108, 866, 864, 300, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(243,196,139,0.16)";
  ctx.stroke();

  ctx.fillStyle = "rgba(245,240,232,0.42)";
  ctx.font = "15px ui-monospace, Menlo, monospace";
  ctx.fillText("JOIN MY FURNACE", 138, 912);

  ctx.fillStyle = "#f3c48b";
  ctx.font = "500 34px Georgia, 'Times New Roman', serif";
  ctx.fillText("8% lifetime referral", 138, 960);

  ctx.fillStyle = "rgba(245,240,232,0.5)";
  ctx.font = "15px ui-monospace, Menlo, monospace";
  const shortLink = data.referralLink.replace(/^https?:\/\//, "");
  ctx.fillText(shortLink.length > 48 ? `${shortLink.slice(0, 48)}…` : shortLink, 138, 1004);

  ctx.fillStyle = "rgba(245,240,232,0.32)";
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.fillText(`OPERATOR ${data.address.slice(0, 10)}…${data.address.slice(-8)}`, 138, 1110);

  // QR
  const qr = await QRCode.toDataURL(data.referralLink, {
    margin: 1,
    width: 220,
    color: { dark: "#0b0810", light: "#f3c48b" },
  });
  const image = new Image();
  image.src = qr;
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
  });
  ctx.fillStyle = "#f3c48b";
  roundedRect(ctx, 792, 892, 152, 152, 14);
  ctx.fill();
  ctx.drawImage(image, 802, 902, 132, 132);

  // Footer
  ctx.fillStyle = "rgba(245,240,232,0.3)";
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText("HOLD TO MINE · AGENT ID NATIVE · BNB CHAIN", 108, 1236);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(243,196,139,0.7)";
  ctx.font = "15px ui-monospace, Menlo, monospace";
  ctx.fillText("AETHER.FORGE", 972, 1236);

  return canvas.toDataURL("image/png");
}
