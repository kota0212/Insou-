declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}

declare module 'pdfjs-dist/webpack.mjs' {
  export * from 'pdfjs-dist';
}
