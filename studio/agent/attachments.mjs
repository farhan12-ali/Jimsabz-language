export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_REPORT_TEXT = 120000;
export function cleanReportText(text) {
  return String(text)
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}
export function docxText(xml) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("This DOCX contains invalid document text.");
  const paragraphs = [...document.getElementsByTagNameNS("*", "p")];
  return paragraphs
    .map((p) =>
      [...p.getElementsByTagNameNS("*", "t")]
        .map((t) => t.textContent)
        .join(""),
    )
    .join("\n");
}
export async function readAttachment(file) {
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`${file.name}: use a file smaller than 10 MB.`);
  const extension = file.name.split(".").at(-1).toLowerCase();
  let text = "";
  if (["txt", "md", "jimsabz", "csv"].includes(extension))
    text = await file.text();
  else if (extension === "docx") {
    const { unzipSync, strFromU8 } = await import("../vendor/fflate.mjs");
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        if (entry.name !== "word/document.xml") return false;
        if (entry.originalSize > 4 * 1024 * 1024)
          throw new Error(
            "The DOCX text is too large. Upload a shorter report.",
          );
        return true;
      },
    });
    if (!files["word/document.xml"])
      throw new Error("This file is not a readable DOCX document.");
    text = docxText(strFromU8(files["word/document.xml"]));
  } else if (extension === "pdf") {
    const pdfjs = await import("../vendor/pdfjs/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "../vendor/pdfjs/pdf.worker.mjs",
      import.meta.url,
    ).href;
    const loading = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: true,
      cMapUrl: new URL("../vendor/pdfjs/cmaps/", import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL(
        "../vendor/pdfjs/standard_fonts/",
        import.meta.url,
      ).href,
      wasmUrl: new URL("../vendor/pdfjs/wasm/", import.meta.url).href,
    });
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > 80)
        throw new Error("Use a report with at most 80 pages.");
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index),
          content = await page.getTextContent();
        text +=
          content.items
            .map((item) => (item.str || "") + (item.hasEOL ? "\n" : " "))
            .join("") + "\n";
        page.cleanup();
        if (text.length > MAX_REPORT_TEXT)
          throw new Error(
            "The report text is too long. Upload the relevant requirements section.",
          );
      }
    } catch (error) {
      if (error.name === "PasswordException")
        throw new Error("Unlock the PDF before attaching it.");
      throw error;
    } finally {
      await loading.destroy();
    }
  } else throw new Error("Attach a PDF, DOCX, TXT, MD, CSV or Jimsabz file.");
  text = cleanReportText(text);
  if (!text)
    throw new Error(
      "No readable text was found. Scanned PDFs need OCR first; use a text PDF, DOCX or TXT report.",
    );
  if (text.length > MAX_REPORT_TEXT)
    throw new Error(
      "The report text is too long. Upload a shorter requirements section.",
    );
  return { name: file.name, text, kind: extension, size: file.size };
}
