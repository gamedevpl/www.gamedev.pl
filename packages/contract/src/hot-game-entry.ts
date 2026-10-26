export type HotGameDeclaration = {
  protocol: 1;
  id: string;
  stateVersion: number;
  observationVersion: number;
  behavior: string;
};

export function gameTypeScriptEntry(source: string, manifestSource?: string) {
  const hot = manifestSource ? (JSON.parse(manifestSource) as { hot?: HotGameDeclaration }).hot : undefined;
  if (hot === undefined) return { source, entryFile: 'game.ts' };
  if (
    hot?.protocol !== 1 ||
    typeof hot.id !== 'string' ||
    !hot.id.trim() ||
    hot.id.length > 128 ||
    !Number.isSafeInteger(hot.stateVersion) ||
    hot.stateVersion < 1 ||
    !Number.isSafeInteger(hot.observationVersion) ||
    hot.observationVersion < 1 ||
    typeof hot.behavior !== 'string' ||
    !/^game\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/.test(hot.behavior)
  )
    throw Error('Invalid GAME.json.hot declaration');
  const config = JSON.stringify({ id: hot.id, stateVersion: hot.stateVersion }).replace(/</g, '\\u003c');
  return {
    entryFile: '__hot-bootstrap.ts',
    source: `
    import boot from './game.ts';
    import behavior from ${JSON.stringify('./' + hot.behavior)};
    const builder=GameKit.defineGame();
    if(typeof builder.hot==='function')builder.hot(${config});
    builder.update(behavior.update).render(behavior.render).snapshot(behavior.snapshot);
    const callbacks=['hud','preAmbient','ambient','foreground','ui','observation','agentApi'];
    for(const name of callbacks)if(behavior[name]!=null)builder[name](behavior[name]);
    if(behavior.persist!=null)builder.persist(behavior.persist.toJSON,behavior.persist.fromJSON);
    const bootBuilder={};
    for(const name of Object.keys(builder)){
      if(['update','render','snapshot',...callbacks,'persist','hot','prepare','start'].includes(name))continue;
      bootBuilder[name]=(...args)=>{builder[name](...args);return bootBuilder;};
    }
    if(boot(bootBuilder)!==bootBuilder)throw Error('Hot boot must return the provided builder');
    builder.start();
  `,
  };
}
