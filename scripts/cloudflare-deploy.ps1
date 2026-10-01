param([switch]$SkipBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
if(-not $SkipBuild){node scripts/cloudflare-build.mjs;if($LASTEXITCODE -ne 0){throw 'Build failed'}}
$secrets=Join-Path $root '.data/cloudflare-secrets.json'
if(-not(Test-Path -LiteralPath $secrets)){throw 'Create the ignored .data/cloudflare-secrets.json with DEMO_PASSWORD and SERVICE_SECRET first.'}
npx wrangler deploy --config deployment/wrangler.jsonc
if($LASTEXITCODE -ne 0){throw 'Deployment failed'}
npx wrangler secret bulk $secrets --config deployment/wrangler.jsonc
if($LASTEXITCODE -ne 0){throw 'Secret upload failed; presentation stays unavailable until configured.'}
foreach($entry in @('ota','utn','api')){
    npx wrangler deploy --config "deployment/$entry.jsonc"
    if($LASTEXITCODE -ne 0){throw "Deployment failed for $entry entry"}
}
Write-Output 'Presentation deployed. Access password is in the ignored .data/cloudflare-secrets.json file.'
