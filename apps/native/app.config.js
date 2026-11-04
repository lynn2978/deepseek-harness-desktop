import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import configPlugins from 'expo/config-plugins.js'

const { AndroidConfig, withAndroidManifest, withDangerousMod, withInfoPlist, withMainActivity, withPodfile, withPodfileProperties, withXcodeProject } = configPlugins
const iosDeploymentTarget = '16.3'
const podspecPlatform = /(:ios|:tvos)(\s*=>\s*)'16\.4'/g
const podspecs = [
  ['@expo/dom-webview', 'ios/ExpoDomWebView.podspec'],
  ['@expo/log-box', 'ExpoLogBox.podspec'],
  ['@expo/ui', 'ios/ExpoUI.podspec'],
  ['expo-application', 'ios/EXApplication.podspec'],
  ['expo-asset', 'ios/ExpoAsset.podspec'],
  ['expo-blur', 'ios/ExpoBlur.podspec'],
  ['expo-camera', 'ios/ExpoCamera.podspec'],
  ['expo-camera', 'ios/ExpoCameraBarcodeScanning.podspec'],
  ['expo-constants', 'ios/EXConstants.podspec'],
  ['expo-crypto', 'ios/ExpoCrypto.podspec'],
  ['expo-dev-client', 'ios/expo-dev-client.podspec'],
  ['expo-dev-launcher', 'expo-dev-launcher.podspec'],
  ['expo-dev-menu-interface', 'ios/expo-dev-menu-interface.podspec'],
  ['expo-dev-menu', 'expo-dev-menu.podspec'],
  ['expo-file-system', 'ios/ExpoFileSystem.podspec'],
  ['expo-font', 'ios/ExpoFont.podspec'],
  ['expo-glass-effect', 'ios/ExpoGlassEffect.podspec'],
  ['expo-json-utils', 'ios/EXJSONUtils.podspec'],
  ['expo-keep-awake', 'ios/ExpoKeepAwake.podspec'],
  ['expo-linking', 'ios/ExpoLinking.podspec'],
  ['expo-localization', 'ios/ExpoLocalization.podspec'],
  ['expo-manifests', 'ios/EXManifests.podspec'],
  ['expo-modules-core', 'ExpoModulesCore.podspec'],
  ['expo-modules-core', 'ExpoModulesWorklets.podspec'],
  ['expo-modules-core', 'ExpoModulesWorkletsAdapter.podspec'],
  ['expo-modules-jsi', 'apple/ExpoModulesJSI.podspec'],
  ['expo-network', 'ios/ExpoNetwork.podspec'],
  ['expo-notifications', 'ios/ExpoNotifications.podspec'],
  ['expo-router', 'ios/ExpoRouter.podspec'],
  ['expo-secure-store', 'ios/ExpoSecureStore.podspec'],
  ['expo-splash-screen', 'ios/ExpoSplashScreen.podspec'],
  ['expo-symbols', 'ios/ExpoSymbols.podspec'],
  ['expo-system-ui', 'ios/ExpoSystemUI.podspec'],
  ['expo-updates-interface', 'ios/EXUpdatesInterface.podspec'],
  ['expo', 'Expo.podspec'],
]
const cornerRadiusCall = '    content.presentationCornerRadius(cornerRadius.map { CGFloat($0) })'
const cornerRadiusGuard = `    if #available(iOS 16.4, tvOS 16.4, *) {
      content.presentationCornerRadius(cornerRadius.map { CGFloat($0) })
    } else {
      content
    }`
const backgroundCall = `    if let shapeStyle = style?.toAnyShapeStyle() {
      content.presentationBackground(shapeStyle)
    } else {
      content
    }`
const backgroundGuard = `    if #available(iOS 16.4, tvOS 16.4, *) {
      if let shapeStyle = style?.toAnyShapeStyle() {
        content.presentationBackground(shapeStyle)
      } else {
        content
      }
    } else {
      content
    }`
const podfileAnchor = '      :ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n  end'
const podfileFallback = "platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'"
const podfileFallbackPatched = "platform :ios, podfile_properties['ios.deploymentTarget'] || '16.3'"
const podfilePatched = `      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
    if installer.pods_project
      installer.pods_project.targets.each do |target|
        target.build_configurations.each do |configuration|
          configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.3'
        end
      end
    end
  end`
const notices = new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url)
const mainActivityClass = 'class MainActivity : ReactActivity() {'
const superOnCreate = /^([ \t]*)super\.onCreate\(/m
const orientationMembers = '\n  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {\n    super.onConfigurationChanged(newConfig)\n    applyScreenOrientation(newConfig)\n  }\n\n  private fun applyScreenOrientation(config: android.content.res.Configuration) {\n    requestedOrientation = if (config.smallestScreenWidthDp < 600) {\n      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT\n    } else {\n      android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_USER\n    }\n  }\n'

const pnpmPackages = (projectRoot) => {
  const expoPackage = createRequire(join(projectRoot, 'package.json')).resolve('expo/package.json')
  return join(resolve(realpathSync(dirname(expoPackage)), '../../..'), 'node_modules')
}

const rewrite = (file, transform) => {
  const contents = readFileSync(file, 'utf8')
  const patched = transform(contents)
  if (patched === contents)
    return
  const temporary = `${file}.dsh-ios16-tmp`
  writeFileSync(temporary, patched)
  renameSync(temporary, file)
}

const withIos16Sources = (config) => withDangerousMod(config, ['ios', (value) => {
  if (value.modRequest.introspect)
    return value
  const packages = pnpmPackages(value.modRequest.projectRoot)
  for (const [name, relativePath] of podspecs) {
    const file = join(realpathSync(join(packages, name)), relativePath)
    if (!existsSync(file))
      throw new Error(`iOS 16.3 compatibility patch is missing ${name}/${relativePath}`)
    rewrite(file, (contents) => contents.replace(podspecPlatform, `$1$2'16.3'`))
    if (/16\.4/.test(readFileSync(file, 'utf8')))
      throw new Error(`iOS 16.3 compatibility patch could not update ${name}/${relativePath}`)
  }
  const swiftFile = join(realpathSync(join(packages, '@expo/ui')), 'ios/Modifiers/PresentationModifiers.swift')
  if (!existsSync(swiftFile))
    throw new Error('iOS 16.3 compatibility patch is missing @expo/ui/ios/Modifiers/PresentationModifiers.swift')
  rewrite(swiftFile, (contents) => {
    const cornerRadiusPatched = contents.includes(cornerRadiusGuard)
    const backgroundPatched = contents.includes(backgroundGuard)
    if (cornerRadiusPatched && backgroundPatched)
      return contents
    if (cornerRadiusPatched !== backgroundPatched)
      throw new Error('@expo/ui PresentationModifiers.swift has a partial iOS 16.3 compatibility patch')
    if (!contents.includes(cornerRadiusCall) || !contents.includes(backgroundCall))
      throw new Error('@expo/ui PresentationModifiers.swift no longer matches the iOS 16.3 compatibility patch')
    return contents.replace(cornerRadiusCall, () => cornerRadiusGuard).replace(backgroundCall, () => backgroundGuard)
  })
  return value
}])

const withIos16DeploymentTarget = (config) => withXcodeProject(config, (value) => {
  for (const entry of Object.values(value.modResults.pbxXCBuildConfigurationSection())) {
    if (entry && typeof entry === 'object' && entry.buildSettings)
      entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = iosDeploymentTarget
  }
  return value
})

const withIos16MinimumOSVersion = (config) => withInfoPlist(config, (value) => {
  value.modResults.MinimumOSVersion = iosDeploymentTarget
  return value
})

const withIos16PodTargets = (config) => withPodfile(config, (value) => {
  const { contents } = value.modResults
  let patched = contents
  if (!patched.includes("IPHONEOS_DEPLOYMENT_TARGET'] = '16.3'")) {
    if (!patched.includes(podfileAnchor))
      throw new Error('Podfile no longer matches the iOS 16.3 compatibility patch')
    patched = patched.replace(podfileAnchor, () => podfilePatched)
  }
  if (!patched.includes(podfileFallbackPatched)) {
    if (!patched.includes(podfileFallback))
      throw new Error('Podfile deployment target fallback no longer matches the iOS 16.3 compatibility patch')
    patched = patched.replace(podfileFallback, () => podfileFallbackPatched)
  }
  value.modResults.contents = patched
  return value
})

const withIos16PodfileProperties = (config) => withPodfileProperties(config, (value) => {
  value.modResults['ios.deploymentTarget'] = iosDeploymentTarget
  value.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false'
  return value
})

export default function appConfig({ config }) {
  const withNotices = { ...config, extra: { ...config.extra, thirdPartyNotices: readFileSync(notices, 'utf8') } }
  const withManifest = withAndroidManifest(withNotices, (value) => {
    AndroidConfig.Manifest.getMainActivityOrThrow(value.modResults).$['android:screenOrientation'] = 'fullUser'
    return value
  })
  const withActivity = withMainActivity(withManifest, (value) => {
    const { contents } = value.modResults
    if (contents.includes('applyScreenOrientation('))
      return value
    if (!contents.includes(mainActivityClass) || !superOnCreate.test(contents))
      throw new Error('MainActivity.kt no longer matches the Expo template that the tablet orientation patch expects')
    value.modResults.contents = contents.replace(superOnCreate, '$1applyScreenOrientation(resources.configuration)\n$1super.onCreate(').replace(mainActivityClass, () => `${mainActivityClass}\n${orientationMembers}`)
    return value
  })
  return [
    withIos16Sources,
    withIos16DeploymentTarget,
    withIos16MinimumOSVersion,
    withIos16PodTargets,
    withIos16PodfileProperties,
  ].reduce((current, plugin) => plugin(current), withActivity)
}
