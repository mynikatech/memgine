import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export const escapeDocumentHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const escapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return escapes[character] ?? character;
  });

const openBrowserPrintDialog = (html: string) => {
  if (typeof window === "undefined") {
    throw new Error("Printing is not available in this browser.");
  }
  const popup = window.open("", "_blank");
  if (!popup) {
    throw new Error("Allow pop-ups to print this document.");
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
};

/** Opens the platform print dialog without storing a document remotely. */
export const printDocumentHtml = async (html: string) => {
  if (Platform.OS === "web") {
    openBrowserPrintDialog(html);
    return;
  }
  await Print.printAsync({ html });
};

/**
 * On native, creates a local PDF and hands it to the operating-system share
 * sheet. On web, the browser print dialog provides its normal Save as PDF
 * option for the exact same document.
 */
export const saveOrShareDocumentPdf = async (html: string) => {
  if (Platform.OS === "web") {
    openBrowserPrintDialog(html);
    return;
  }

  const file = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("PDF sharing is not available on this device.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    dialogTitle: "Save or share PDF",
  });
};

export const isDocumentActionCancellation = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel|dismiss|abort/i.test(message);
};

const isAgreementSectionHeading = (line: string) =>
  [
    "included benefits",
    "restrictions",
    "participating stores",
    "organization membership terms and conditions",
    "membership terms and conditions",
  ].includes(line.trim().toLowerCase());

/** Builds a printable view from the exact immutable agreement text provided. */
export const membershipAgreementHtml = (agreementText: string) => {
  const body = agreementText
    .split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div class="space"></div>';
      const escaped = escapeDocumentHtml(trimmed);
      if (index === 0 && trimmed === "MEMBERSHIP AGREEMENT") {
        return `<h1>${escaped}</h1>`;
      }
      if (index === 1) return `<p class="organization">${escaped}</p>`;
      if (isAgreementSectionHeading(trimmed)) return `<h2>${escaped}</h2>`;
      if (trimmed.startsWith("- ")) {
        return `<p class="bullet">• ${escapeDocumentHtml(trimmed.substring(2))}</p>`;
      }
      if (/^\d+(?:\.\d+)*[.)]\s+/.test(trimmed)) {
        return `<p class="clause">${escaped}</p>`;
      }
      return `<p>${escaped}</p>`;
    })
    .join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Membership Agreement</title>
<style>@page{size:A4;margin:18mm}body{font:14px Arial,sans-serif;color:#1f2937;max-width:760px;margin:auto;line-height:1.55}h1{font-size:23px;margin:0 0 4px;color:#111827}h2{font-size:16px;margin:22px 0 8px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;color:#111827}.organization{font-weight:600;margin:0 0 16px}.bullet{padding-left:14px}.clause{margin-left:0}.space{height:10px}</style></head>
<body>${body}</body></html>`;
};
