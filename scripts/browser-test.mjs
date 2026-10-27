// CI runs the same memory-isolated UI checks as smoke.html, without a CDN dependency.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'test-results');await mkdir(output,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const three=await readFile(resolve(root,'node_modules/three/build/three.module.js'));
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
  for(const [name,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport,reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:three}));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
    try{
      await page.goto(`http://127.0.0.1:${server.address().port}/smoke.html`);
      await page.locator('#smokeReport[data-complete="true"]').waitFor({timeout:120000});
      const report=await page.locator('#smokeReport').innerText();
      await writeFile(resolve(output,`${name}.txt`),report+'\n\nConsole errors:\n'+errors.join('\n'));
      assert.equal(await page.locator('#smokeChecks .bad').count(),0,report);
      assert.deepEqual(errors,[],`${name}: browser errors`);
      assert.ok(await page.locator('#smokeChecks .ok').count()>=33,'Not all UI checks ran');
      console.log(`${name}: ${await page.locator('#smokeSummary').innerText()}`);
      await page.screenshot({path:resolve(output,`${name}-game.png`),fullPage:true});
      await page.goto(`http://127.0.0.1:${server.address().port}/lab.html`);
      await page.locator('[data-expected="mink"]').waitFor();
      await page.getByRole('button',{name:'희석 Dd × Dd',exact:true}).click();
      assert.equal(await page.locator('[data-expected="dilute"]').innerText(),'25.0%');
      const allele=page.locator('#father select[data-locus="D"][data-index="0"]');
      await allele.focus();await allele.selectOption('d');
      assert.equal(await page.locator('[data-expected="dilute"]').innerText(),'50.0%');
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.locus),'D','Allele edit lost keyboard focus');
      await page.getByRole('button',{name:'X연관 오렌지',exact:true}).click();
      assert.equal(await page.locator('[data-expected="tortie"]').innerText(),'50.0%');
      await page.getByRole('button',{name:'밍크 cb × cs',exact:true}).click();
      assert.equal(await page.locator('[data-expected="mink"]').innerText(),'100.0%');
      await page.locator('#run').click();await page.locator('#results:not([hidden])').waitFor({timeout:30000});
      assert.match(await page.locator('[data-comparison="mink"]').innerText(),/100\.0%\s+100\.0%\s+0\.0/);
      await page.locator('#count').selectOption('10000');await page.locator('#run').click();await page.locator('#cancel').click();
      await page.getByRole('heading',{name:'중지한 실험 결과',exact:true}).waitFor();
      assert.equal(await page.locator('#run').isEnabled(),true,'Cancellation did not restore controls');
      assert.deepEqual(errors,[],`${name}: lab browser errors`);
      console.log(`${name}: lab theory, allele editing focus, seeded results and cancellation passed`);
      await page.screenshot({path:resolve(output,`${name}-lab.png`),fullPage:true});
      // Exercise the normal entry point with actual pointer actions and frame-driven walking.
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.locator('#coins').filter({hasText:'200'}).waitFor();
      assert.equal(await page.locator('#top .dev').isVisible(),false,'Public entry exposed time skips');
      await page.locator('#worldPenUpgrade').waitFor({state:'visible'});
      assert.equal(await page.locator('#worldPenUpgrade').innerText(),'⬆ 업그레이드');
      await page.locator('#worldPenUpgrade').click();
      await page.locator('#modal h2').filter({hasText:'우리 확장'}).waitFor();
      assert.match(await page.locator('#modal').innerText(),/40냥 더/);
      await page.locator('#modal [data-act="close"]').click();
      for(const tab of ['breed','shop','npc','dex'])assert.equal(await page.locator(`#tabs [data-tab="${tab}"]`).isVisible(),false);
      await page.locator('#tabs [data-tab="home"]').click();
      assert.match(await page.locator('.pen-status').innerText(),/4\/6마리/);
      assert.equal(await page.locator('#homeTools').getAttribute('open'),null);
      await page.locator('.next-step [data-act="navigate"][data-zone="breed"]').click();
      await page.locator('#panel h2').filter({hasText:'💞 교배'}).waitFor({timeout:45000});
      await page.locator('#panel [data-act="pick"]:not(:disabled)').first().click();
      await page.locator('#panel [data-act="pick"]:not(:disabled)').first().click();
      await page.locator('#panel [data-act="dobreed"]').click();
      await page.locator('#modal h2').filter({hasText:'새 가족'}).waitFor({timeout:20000});
      await page.locator('#modal [data-act="close"]').click();
      assert.match(await page.locator('.pen-status').innerText(),/5\/6마리/);
      await page.locator('#panel [data-act="care"][data-a="yarn"]').click();
      assert.equal(await page.locator('#panel [data-act="care"][data-a="yarn"]').isDisabled(),true);
      await page.locator('#tabs [data-act="mapguide"]').click();
      assert.equal(await page.locator('#modal .village-map').count(),1);
      assert.equal(await page.locator('#modal [data-act="navigate"]').count(),8);
      await page.locator('#modal [data-zone="npc:n5"]').click();
      await page.locator('#panel h2').filter({hasText:'이웃'}).waitFor({timeout:90000});
      assert.match(await page.locator('#panel').innerText(),/미루/);
      await page.locator('#tabs [data-act="mapguide"]').click();
      await page.locator('#modal [data-zone="dex"]').click();
      await page.locator('#panel h2').filter({hasText:'📖 도감'}).waitFor({timeout:90000});
      assert.equal(await page.locator('#panel a[href="lab.html"]').isVisible(),true);
      await page.reload();await page.locator('#tabs [data-tab="home"][aria-controls="panel"]').waitFor();await page.locator('#tabs [data-tab="home"]').click();
      await page.locator('.pen-status').filter({hasText:'5/6마리'}).waitFor();
      assert.equal(await page.locator('#top .dev').isVisible(),false);
      assert.deepEqual(errors,[],`${name}: normal play browser errors`);
      console.log(`${name}: normal play, real navigation, birth/care, all-neighbor map, library and reload passed`);
    }finally{
      await page.screenshot({path:resolve(output,`${name}.png`),fullPage:true});
      await context.close();
    }
  }
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
