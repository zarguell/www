/** Render Markdown ```mermaid blocks with the vendored Mermaid runtime. */
(() => {
  const blocks = Array.from(document.querySelectorAll('.mermaid-block'));
  if (!blocks.length || !window.mermaid) return;

  const sources = blocks.map((block) => block.querySelector('.mermaid')?.textContent ?? '');

  const dark = {
    darkMode: true,
    background: '#0f0f0f',
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontSize: '14px',
    primaryColor: '#141414',
    primaryTextColor: '#ededed',
    primaryBorderColor: '#3a3a3a',
    secondaryColor: '#191919',
    secondaryTextColor: '#ededed',
    secondaryBorderColor: '#3a3a3a',
    tertiaryColor: '#101010',
    tertiaryTextColor: '#ededed',
    tertiaryBorderColor: '#3a3a3a',
    lineColor: '#7a7a7a',
    textColor: '#ededed',
    mainBkg: '#141414',
    nodeBorder: '#3a3a3a',
    clusterBkg: '#101010',
    clusterBorder: '#3a3a3a',
    edgeLabelBackground: '#0f0f0f',
    actorBkg: '#141414',
    actorBorder: '#3a3a3a',
    actorTextColor: '#ededed',
    actorLineColor: '#3a3a3a',
    signalColor: '#9a9a9a',
    signalTextColor: '#ededed',
    labelBoxBkgColor: '#141414',
    labelBoxBorderColor: '#3a3a3a',
    labelTextColor: '#ededed',
    loopTextColor: '#ededed',
    noteBkgColor: '#191919',
    noteTextColor: '#ededed',
    noteBorderColor: '#3a3a3a',
    activationBkgColor: '#1a1a1a',
    activationBorderColor: '#7ee2a8',
    sequenceNumberColor: '#0f0f0f'
  };

  const light = {
    darkMode: false,
    background: '#fbfbf9',
    fontFamily: 'IBM Plex Sans, sans-serif',
    fontSize: '14px',
    primaryColor: '#f0f0ec',
    primaryTextColor: '#151515',
    primaryBorderColor: '#b8b8af',
    secondaryColor: '#e8e8e3',
    secondaryTextColor: '#151515',
    secondaryBorderColor: '#b8b8af',
    tertiaryColor: '#f4f4f1',
    tertiaryTextColor: '#151515',
    tertiaryBorderColor: '#b8b8af',
    lineColor: '#5f5f5a',
    textColor: '#151515',
    mainBkg: '#f0f0ec',
    nodeBorder: '#b8b8af',
    clusterBkg: '#f4f4f1',
    clusterBorder: '#b8b8af',
    edgeLabelBackground: '#fbfbf9',
    actorBkg: '#f0f0ec',
    actorBorder: '#b8b8af',
    actorTextColor: '#151515',
    actorLineColor: '#b8b8af',
    signalColor: '#5f5f5a',
    signalTextColor: '#151515',
    labelBoxBkgColor: '#f0f0ec',
    labelBoxBorderColor: '#b8b8af',
    labelTextColor: '#151515',
    loopTextColor: '#151515',
    noteBkgColor: '#e8e8e3',
    noteTextColor: '#151515',
    noteBorderColor: '#b8b8af',
    activationBkgColor: '#e8e8e3',
    activationBorderColor: '#167a45',
    sequenceNumberColor: '#fbfbf9'
  };

  let rendering = false;

  async function render(theme) {
    if (rendering) return;
    rendering = true;
    try {
      blocks.forEach((block, index) => {
        block.querySelectorAll('.mermaid, svg').forEach((node) => node.remove());
        const pre = document.createElement('pre');
        pre.className = 'mermaid';
        pre.textContent = sources[index];
        block.appendChild(pre);
        block.classList.remove('mermaid-block--error');
      });
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: theme === 'light' ? light : dark,
        sequence: {
          diagramMarginX: 10,
          diagramMarginY: 10,
          actorMargin: 20,
          width: 100,
          height: 40,
          boxMargin: 8,
          messageMargin: 26,
          mirrorActors: false,
          useMaxWidth: true,
          wrap: true,
          wrapPadding: 8
        }
      });
      await window.mermaid.run({ nodes: Array.from(document.querySelectorAll('.mermaid')) });
    } catch {
      blocks.forEach((block) => block.classList.add('mermaid-block--error'));
    } finally {
      rendering = false;
    }
  }

  render(document.documentElement.dataset.theme);
  new MutationObserver(() => render(document.documentElement.dataset.theme)).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['data-theme'] }
  );
})();
