const path = require('path')

exports.default = async function afterPack(context) {
  const { rcedit } = require('rcedit')
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(__dirname, 'resources', 'icon.ico')

  console.log(`Setting icon for ${exePath}...`)
  await rcedit(exePath, { icon: iconPath })
  console.log('Icon set successfully!')
}
