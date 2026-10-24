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
    try{
      await page.goto(`http://127.0.0.1:${server.address().port}/smoke.html`);
      await page.locator('#smokeReport[data-complete="true"]').waitFor({timeout:120000});
      const report=await page.locator('#smokeReport').innerText();
      await writeFile(resolve(output,`${name}.txt`),report+'\n\nConsole errors:\n'+errors.join('\n'));
      assert.equal(await page.locator('#smokeChecks .bad').count(),0,report);
      assert.deepEqual(errors,[],`${name}: browser errors`);
      assert.ok(await page.locator('#smokeChecks .ok').count()>=28,'Not all UI checks ran');
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
    }finally{
      await page.screenshot({path:resolve(output,`${name}.png`),fullPage:true});
      await context.close();
    }
  }
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
