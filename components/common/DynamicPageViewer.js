import Head from "next/head";
import Viewer from "@/components/common/Viewer";

export default function DynamicPageViewer({ 
  componentPath, 
  metadata, 
  isLoading, 
  loadingMessage = "Loading test or invalid path..." 
}) {
  // If component path couldn't be determined, show loading
  if (isLoading) {
    return <div>{loadingMessage}</div>;
  }

  return (
    <>
      <Head>
        <title>{metadata.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>
      <Viewer
        componentPath={componentPath}
        metadata={metadata}
      />
    </>
  );
} 