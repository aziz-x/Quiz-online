$src = 'C:\Users\bzaz\OneDrive\Desktop\quiz1'
$dst = 'C:\Users\bzaz\OneDrive\Desktop\quiz\New folder'
$items = @('package.json','package-lock.json','yarn.lock','pnpm-lock.yaml','index.html','README.md','vite.config.js','postcss.config.js','tailwind.config.js','eslint.config.js','src','public','restaurant-menu')

# Create destination
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$copied = @()
foreach ($i in $items) {
    $path = Join-Path $src $i
    if (Test-Path $path) {
        try {
            if ((Get-Item $path).PSIsContainer) {
                Copy-Item -Path $path -Destination $dst -Recurse -Force -ErrorAction Stop
            } else {
                Copy-Item -Path $path -Destination $dst -Force -ErrorAction Stop
            }
            $copied += $i
        } catch {
            Write-Output "FailedCopy:$i -> $($_.Exception.Message)"
        }
    }
}

Write-Output '---COPIED---'
$copied
Write-Output '---DEST CONTENTS (top level)---'
Get-ChildItem -Path $dst | Select-Object Name, @{Name='Type';Expression={if ($_.PSIsContainer){'Directory'} else {'File'}}} | Format-Table -AutoSize
