/** Browser download of in-memory bytes. The only DOM-touching bit of the zip path, kept apart so tests can stub it. */
export function downloadZip(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers start the download asynchronously; revoking now can yield an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
