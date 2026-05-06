/**
 * 流程图 XML 后处理模块
 * 包含：XML 提取、验证清理、画布自适应、属性转义
 */

/**
 * 从 AI 返回内容中提取 mxGraphModel XML
 */
export function extractMxGraphModel(content: string): { xml: string | null; error: string | null; isTruncated: boolean } {
  if (!content || typeof content !== 'string') {
    return { xml: null, error: '返回内容为空', isTruncated: false };
  }

  let cleanedContent = content
    .replace(/```xml\s*/gi, '')
    .replace(/```\s*$/gm, '')
    .replace(/```/g, '')
    .trim();

  const startTag = '<mxGraphModel';
  const endTag = '</mxGraphModel>';

  const startIndices: number[] = [];
  let searchIndex = 0;
  while ((searchIndex = cleanedContent.indexOf(startTag, searchIndex)) !== -1) {
    startIndices.push(searchIndex);
    searchIndex += startTag.length;
  }

  const candidates: string[] = [];
  for (const startIdx of startIndices) {
    const afterStart = cleanedContent.substring(startIdx + startTag.length);
    const endIdx = afterStart.indexOf(endTag);
    if (endIdx !== -1) {
      const xml = cleanedContent.substring(startIdx, startIdx + startTag.length + endIdx + endTag.length);
      candidates.push(xml);
    }
  }

  if (candidates.length > 0) {
    const bestCandidate = candidates.sort((a, b) => {
      const countA = (a.match(/<mxCell/g) || []).length;
      const countB = (b.match(/<mxCell/g) || []).length;
      return countB - countA;
    })[0];
    return { xml: bestCandidate, error: null, isTruncated: false };
  }

  if (cleanedContent.includes(startTag)) {
    const startIndex = cleanedContent.indexOf(startTag);
    const endIndex = cleanedContent.lastIndexOf(endTag);

    if (endIndex > startIndex) {
      const xml = cleanedContent.substring(startIndex, endIndex + endTag.length);
      return { xml, error: null, isTruncated: false };
    }

    // 截断修复
    let xml = cleanedContent.substring(startIndex);
    const lastCompleteCell = xml.lastIndexOf('</mxCell>');
    if (lastCompleteCell > 0) {
      xml = xml.substring(0, lastCompleteCell + '</mxCell>'.length);
    }
    if (!xml.includes('</root>')) xml += '</root>';
    if (!xml.includes('</mxGraphModel>')) xml += '</mxGraphModel>';

    const cellCount = (xml.match(/<mxCell/g) || []).length;
    if (cellCount >= 3) {
      return { xml, error: null, isTruncated: true };
    }
  }

  return {
    xml: null,
    error: `无法从返回内容中提取有效 XML。内容长度: ${content.length}`,
    isTruncated: false,
  };
}

/**
 * 转义 XML 属性值中的特殊字符
 */
export function escapeXmlAttributes(xml: string): string {
  return xml.replace(
    /value="([^"]*)"/g,
    (match, content) => {
      const unescaped = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      const escaped = unescaped
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `value="${escaped}"`;
    }
  );
}

/**
 * 根据节点实际坐标动态调整画布尺寸
 * 修复：长流程图节点超出 pageHeight 时连线路由失败
 */
export function adjustCanvasSize(xml: string): string {
  const cellPattern = /<mxCell\s([^>]*?)>([\s\S]*?)<\/mxCell>/g;
  let match: RegExpExecArray | null;
  let maxX = 0;
  let maxY = 0;

  while ((match = cellPattern.exec(xml)) !== null) {
    const attrs = match[1];
    const inner = match[2];
    if (!/vertex="1"/.test(attrs)) continue;

    const xMatch = inner.match(/x="(\d+)"/);
    const yMatch = inner.match(/y="(\d+)"/);
    const wMatch = inner.match(/width="(\d+)"/);
    const hMatch = inner.match(/height="(\d+)"/);

    const x = xMatch ? parseInt(xMatch[1]) : 0;
    const y = yMatch ? parseInt(yMatch[1]) : 0;
    const w = wMatch ? parseInt(wMatch[1]) : 100;
    const h = hMatch ? parseInt(hMatch[1]) : 60;

    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  const padding = 200;
  const neededWidth = maxX + padding;
  const neededHeight = maxY + padding;
  const defaultPageWidth = 850;
  const defaultPageHeight = 1100;
  const newPageWidth = Math.max(defaultPageWidth, neededWidth);
  const newPageHeight = Math.max(defaultPageHeight, neededHeight);
  const newDx = Math.max(1200, newPageWidth);
  const newDy = Math.max(800, newPageHeight);

  let adjusted = xml;
  adjusted = adjusted.replace(/pageHeight="\d+"/, `pageHeight="${newPageHeight}"`);
  adjusted = adjusted.replace(/pageWidth="\d+"/, `pageWidth="${newPageWidth}"`);
  adjusted = adjusted.replace(/dx="\d+"/, `dx="${newDx}"`);
  adjusted = adjusted.replace(/dy="\d+"/, `dy="${newDy}"`);

  return adjusted;
}

/**
 * 验证和清理 XML
 */
export function validateAndCleanXml(xml: string): { xml: string | null; error: string | null } {
  let cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();
  cleaned = escapeXmlAttributes(cleaned);

  if (!cleaned.includes('<mxGraphModel')) {
    return { xml: null, error: 'XML 缺少 mxGraphModel 根元素' };
  }

  const firstStart = cleaned.indexOf('<mxGraphModel');
  const firstEnd = cleaned.indexOf('</mxGraphModel>');
  if (firstStart >= 0 && firstEnd > firstStart) {
    const secondStart = cleaned.indexOf('<mxGraphModel', firstStart + 1);
    if (secondStart > 0 && secondStart < firstEnd) {
      cleaned = cleaned.substring(firstStart, firstEnd + '</mxGraphModel>'.length);
    }
  }

  if (!cleaned.includes('<root>') || !cleaned.includes('</root>')) {
    if (!cleaned.includes('<root>')) {
      cleaned = cleaned.replace(
        '</mxGraphModel>',
        '<root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel>'
      );
    }
  }

  if (!cleaned.includes('mxCell')) {
    return { xml: null, error: 'XML 缺少 mxCell 元素' };
  }

  cleaned = adjustCanvasSize(cleaned);
  return { xml: cleaned, error: null };
}
