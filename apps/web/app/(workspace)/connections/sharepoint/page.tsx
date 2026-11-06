import { ToolPage, toolMetadata } from '@/components/connections/tool-page';

export const metadata = toolMetadata('sharepoint');

export default function Page() {
  return <ToolPage id="sharepoint" />;
}
