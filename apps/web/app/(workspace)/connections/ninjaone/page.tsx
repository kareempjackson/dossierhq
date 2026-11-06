import { ToolPage, toolMetadata } from '@/components/connections/tool-page';

export const metadata = toolMetadata('ninjaone');

export default function Page() {
  return <ToolPage id="ninjaone" />;
}
