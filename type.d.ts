declare module "pdf-parse/lib/pdf-parse.js" {
  function pdf(dataBuffer: Buffer, options?: any): Promise<{ text: string }>;
  export default pdf;
}

declare module "mammoth";
declare module "pdf-parse/lib/pdf-parse.js";