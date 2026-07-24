/**
 * Gerador de payload PIX (EMV QR Code)
 * Padrão Banco Central do Brasil
 */

function emv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixOptions {
  key: string;
  holderName: string;
  city: string;
  amount: number;
  txid?: string;
}

export function generatePixPayload(opts: PixOptions): string {
  const name  = opts.holderName.substring(0, 25).toUpperCase();
  const city  = opts.city.substring(0, 15).toUpperCase();
  const amount = opts.amount.toFixed(2);
  const txid  = (opts.txid ?? "***").substring(0, 25);

  const merchantAccountInfo =
    emv("00", "br.gov.bcb.pix") + emv("01", opts.key);

  const payload =
    emv("00", "01") +
    emv("26", merchantAccountInfo) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amount) +
    emv("58", "BR") +
    emv("59", name) +
    emv("60", city) +
    emv("62", emv("05", txid)) +
    "6304";

  return payload + crc16(payload);
}
