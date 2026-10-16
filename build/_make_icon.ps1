param(
  [string]$OutDir = "assets"
)
# 生成应用图标：各尺寸 PNG + Windows .ico（DIB/BMP 格式，兼容性最好）
Add-Type -AssemblyName System.Drawing

$C_BG = [System.Drawing.Color]::FromArgb(255, 27, 26, 36)
$C_CREAM = [System.Drawing.Color]::FromArgb(255, 245, 243, 250)
$C_ORANGE = [System.Drawing.Color]::FromArgb(255, 255, 122, 69)
$SIZES = @(16, 24, 32, 48, 64, 128, 256)

function New-RoundedRectPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
  $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw-Icon([int]$size) {
  $k = $size / 1024.0
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgPath = New-RoundedRectPath (0 * $k) (0 * $k) $size $size (210 * $k)
  $bgBrush = New-Object System.Drawing.SolidBrush $C_BG
  $g.FillPath($bgBrush, $bgPath)

  $frame = New-RoundedRectPath (168 * $k) (168 * $k) (688 * $k) (688 * $k) (132 * $k)
  $framePen = New-Object System.Drawing.Pen $C_CREAM, ([Math]::Max(1.0, 58 * $k))
  $framePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $framePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $framePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($framePen, $frame)

  $pts = @(
    (New-Object System.Drawing.PointF((742 * $k), (176 * $k))),
    (New-Object System.Drawing.PointF((848 * $k), (176 * $k))),
    (New-Object System.Drawing.PointF((742 * $k), (288 * $k)))
  )
  $bmBrush = New-Object System.Drawing.SolidBrush $C_ORANGE
  $g.FillPolygon($bmBrush, [System.Drawing.PointF[]]$pts)

  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF((268 * $k), (268 * $k))),
    (New-Object System.Drawing.PointF((756 * $k), (756 * $k))),
    [System.Drawing.Color]::FromArgb(255, 255, 138, 76),
    [System.Drawing.Color]::FromArgb(255, 239, 59, 44)
  )
  $linePen = New-Object System.Drawing.Pen($grad), ([Math]::Max(1.0, 62 * $k))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($linePen, (268 * $k), (268 * $k), (756 * $k), (756 * $k))
  $g.Dispose()
  return $bmp
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$master = Draw-Icon 1024
$master.Save((Join-Path $OutDir "icon-master.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()

$images = @()
foreach ($sz in $SIZES) {
  $bmp = Draw-Icon $sz
  $bmp.Save((Join-Path $OutDir "icon-$sz.png"), [System.Drawing.Imaging.ImageFormat]::Png)

  $rect = New-Object System.Drawing.Rectangle(0, 0, $sz, $sz)
  $lock = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $lock.Stride
  $raw = New-Object byte[] ($stride * $sz)
  [System.Runtime.InteropServices.Marshal]::Copy($lock.Scan0, $raw, 0, $raw.Length)
  $bmp.UnlockBits($lock)
  $bmp.Dispose()

  # BITMAPINFOHEADER 字段偏移：Size0 Width4 Height8 Planes12 BitCount14 Compression16 SizeImage20
  $hdr = New-Object byte[] 40
  [BitConverter]::GetBytes([int]40).CopyTo($hdr, 0)
  [BitConverter]::GetBytes([int]$sz).CopyTo($hdr, 4)
  [BitConverter]::GetBytes([int]($sz * 2)).CopyTo($hdr, 8)
  [BitConverter]::GetBytes([int16]1).CopyTo($hdr, 12)
  [BitConverter]::GetBytes([int16]32).CopyTo($hdr, 14)
  [BitConverter]::GetBytes([int]0).CopyTo($hdr, 16)
  [BitConverter]::GetBytes([int]($stride * $sz)).CopyTo($hdr, 20)

  $dib = New-Object byte[] (40 + $stride * $sz)
  $hdr.CopyTo($dib, 0)
  for ($y = $sz - 1; $y -ge 0; $y--) {
    [Array]::Copy($raw, $y * $stride, $dib, (40 + ($sz - 1 - $y) * $stride), $stride)
  }
  $maskRow = [int]([Math]::Ceiling($sz / 32.0) * 4)
  $dib += (New-Object byte[] ($maskRow * $sz))

  # += 会把 byte[] 变成 Object[]，必须转回 byte[]，否则 BinaryWriter 无法按 byte[] 写入
  $images += ,@{ Size = $sz; Dib = [byte[]]$dib }
}

foreach ($img in $images) { Write-Host ("  [dbg] size=$($img.Size) dibType=$($img.Dib.GetType().Name) dibLen=$($img.Dib.Length)") }

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$images.Count)
$offset = 6 + $images.Count * 16
foreach ($img in $images) {
  $w = if ($img.Size -ge 256) { 0 } else { $img.Size }
  $bw.Write([byte]$w); $bw.Write([byte]$w)
  $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$img.Dib.Length)
  $bw.Write([UInt32]$offset)
  $offset += $img.Dib.Length
}
foreach ($img in $images) { $bw.Write($img.Dib) }
$bw.Flush()
$bytes = $ms.ToArray()
[System.IO.File]::WriteAllBytes((Join-Path (Get-Location).Path "icon.ico"), $bytes)
$bw.Dispose(); $ms.Dispose()

Write-Output "icon.ico (DIB) 已生成: $($bytes.Length) bytes, 尺寸 $($SIZES -join ',')"