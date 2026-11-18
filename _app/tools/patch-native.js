// 앱 기본 틀(ios·android 폴더)을 만든 뒤 알림에 필요한 설정을 자동으로 넣는 스크립트
// 설치_맥.command 가 실행함. 여러 번 실행해도 같은 내용이 두 번 들어가지 않음.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const log = (m) => console.log('  · ' + m);

// ── 아이폰 ──
const IOS = path.join(ROOT, 'ios', 'App', 'App');
if (fs.existsSync(IOS)) {
  // 1) AppDelegate.swift: 알림 주소 받기·백그라운드 알림 전달
  const ad = path.join(IOS, 'AppDelegate.swift');
  let s = fs.readFileSync(ad, 'utf8');
  if (!s.includes('capacitorDidRegisterForRemoteNotifications')) {
    const add = `
    // ── 앱 알림 (송우찬수학학원) ──
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }
`;
    const i = s.lastIndexOf('}');
    s = s.slice(0, i) + add + s.slice(i);
    fs.writeFileSync(ad, s);
    log('AppDelegate.swift 에 알림 코드 추가');
  } else log('AppDelegate.swift 는 이미 설정됨');

  // 2) Info.plist: 백그라운드 알림, 암호화 질문 자동 답변(일반 https만 사용)
  const ip = path.join(IOS, 'Info.plist');
  let p = fs.readFileSync(ip, 'utf8');
  const putKey = (key, xml) => { if (!p.includes(`<key>${key}</key>`)) { p = p.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`); log(`Info.plist 에 ${key} 추가`); } };
  putKey('UIBackgroundModes', '<array>\n\t\t<string>remote-notification</string>\n\t</array>');
  putKey('ITSAppUsesNonExemptEncryption', '<false/>');
  putKey('CFBundleDevelopmentRegion', '<string>ko</string>');
  fs.writeFileSync(ip, p);

  // 3) 알림 권한(entitlements) 파일 + 프로젝트에 연결
  const ent = path.join(IOS, 'App.entitlements');
  if (!fs.existsSync(ent)) {
    fs.writeFileSync(ent, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>development</string>
</dict>
</plist>
`);
    log('App.entitlements 만듦 (알림 권한)');
  }
  const pbx = path.join(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  let x = fs.readFileSync(pbx, 'utf8');
  if (!x.includes('CODE_SIGN_ENTITLEMENTS')) {
    x = x.replace(/(INFOPLIST_FILE = App\/Info\.plist;)/g, 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\t$1');
    fs.writeFileSync(pbx, x);
    log('Xcode 프로젝트에 알림 권한 파일 연결');
  }

  // 4) 파이어베이스 설정 파일 복사 (Xcode에 한 번 끌어다 넣어야 함 — 안내 참고)
  const gs = path.join(ROOT, 'GoogleService-Info.plist');
  if (fs.existsSync(gs)) { fs.copyFileSync(gs, path.join(IOS, 'GoogleService-Info.plist')); log('GoogleService-Info.plist 복사'); }
  else log('⚠️ GoogleService-Info.plist 가 아직 없음 (안내 2단계)');
  // Xcode 프로젝트에 등록(앱 안에 들어가게) — 안 하면 앱이 파이어베이스 설정을 못 찾음
  {
    const pbx2 = path.join(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
    let x = fs.readFileSync(pbx2, 'utf8');
    if (fs.existsSync(gs) && !x.includes('GoogleService-Info.plist')) {
      const BF = 'A1B2C3D4E5F6071829304A5B', FR = 'A1B2C3D4E5F6071829304A5C';
      x = x.replace('/* End PBXBuildFile section */', `\t\t${BF} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${FR} /* GoogleService-Info.plist */; };\n/* End PBXBuildFile section */`);
      x = x.replace('/* End PBXFileReference section */', `\t\t${FR} /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };\n/* End PBXFileReference section */`);
      x = x.replace(/(\t+)(\w+ \/\* public \*\/,\n)/, (m, t, rest) => `${t}${rest}${t}${FR} /* GoogleService-Info.plist */,\n`);
      x = x.replace(/(\t+)(\w+ \/\* public in Resources \*\/,\n)/, (m, t, rest) => `${t}${rest}${t}${BF} /* GoogleService-Info.plist in Resources */,\n`);
      fs.writeFileSync(pbx2, x); log('Xcode 프로젝트에 GoogleService-Info.plist 등록');
    }
  }
}

// ── 안드로이드 ──
const AND = path.join(ROOT, 'android', 'app');
if (fs.existsSync(AND)) {
  const gj = path.join(ROOT, 'google-services.json');
  if (fs.existsSync(gj)) { fs.copyFileSync(gj, path.join(AND, 'google-services.json')); log('google-services.json 복사'); }
  else log('⚠️ google-services.json 이 아직 없음 (안내 2단계)');
  // 알림 아이콘 색(학원 보라)
  const mf = path.join(AND, 'src', 'main', 'AndroidManifest.xml');
  let m = fs.readFileSync(mf, 'utf8');
  if (!m.includes('default_notification_color')) {
    m = m.replace(/<application([^>]*)>/, (a) => a + '\n        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/swc_notify" />');
    fs.writeFileSync(mf, m);
    const cv = path.join(AND, 'src', 'main', 'res', 'values', 'swc_colors.xml');
    fs.writeFileSync(cv, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="swc_notify">#5B3FA6</color>\n</resources>\n');
    log('안드로이드 알림 색 설정');
  }
}
console.log('  설정 끝');
