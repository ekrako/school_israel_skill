<div dir="rtl">

# school_israel_skill

> **English:** an agent skill (Claude Code, Codex, Cursor and others) that reads a student's data from
> Israel's school apps, Mashov and SmartSchool Webtop: grades, homework, timetable, attendance and
> messages. Read-only by default. Install with `npx skills add ekrako/school_israel_skill`.
> The rest of this page is in Hebrew; [SKILL.md](SKILL.md) holds the full command reference.

סקיל לסוכני AI (כמו Claude Code ו-Codex) שקורא את נתוני בית הספר מהאפליקציות הנפוצות בישראל:
**משו"ב (Mashov)** ו**סמארט סקול (SmartSchool Webtop)**. הסוכן יכול לענות על שאלות כמו
"מה יש לנועה בשיעורי בית מחר?" או "היו חיסורים השבוע?" מתוך הנתונים האמיתיים.

מה אפשר לקרוא: ציונים, שיעורי בית, מערכת שעות, אירועי התנהגות ונוכחות, הודעות והתראות.
ברירת המחדל היא קריאה בלבד.

## דרישות

- Node.js 24 ומעלה. הסקיל רץ ישירות מקוד TypeScript, בלי שלב בנייה ובלי תלויות בזמן ריצה.
- סוכן שתומך ב-skills (Claude Code, Codex, Cursor ועוד).
- חשבון הורה או תלמיד במשו"ב, או חשבון בסמארט סקול.

## התקנה

ההתקנה נעשית עם [`npx skills`](https://github.com/vercel-labs/skills), שמוריד את הסקיל ומחבר אותו לסוכן.

התקנה לכל הפרויקטים, עבור Claude Code:

```sh
npx skills add ekrako/school_israel_skill -g -a claude-code
```

- בלי `-g` הסקיל מותקן רק לפרויקט הנוכחי.
- סוכן אחר: `-a codex`, `-a cursor` וכדומה. בלי `-a` תופיע רשימה לבחירה.
- הכלי שולח נתוני שימוש אנונימיים. כדי לבטל: `DO_NOT_TRACK=1 npx skills ...`.

פקודות נוספות:

```sh
npx skills list -g                      # הסקילים המותקנים
npx skills update israel-school -g      # עדכון לגרסה האחרונה
npx skills remove israel-school -g      # הסרה
```

עדכון מוחק ויוצר מחדש את תיקיית הסקיל. לכן קובץ ההגדרות נשמר מחוץ לה (ראו בהמשך).

### עדכונים

פעם ביום הסקיל בודק ב-GitHub אם יצאה גרסה חדשה. כשיש, הסוכן מציע לעדכן, ומעדכן רק אם אישרתם.
אפשר גם לעדכן בעצמכם:

```sh
~/.claude/skills/israel-school/scripts/school update
```

הפקודה מריצה את `npx skills update` (בגרסה קבועה של הכלי, בלי נתוני שימוש ובלי פרטי ההתחברות
שלכם בסביבה) עבור ההתקנה הגלובלית או של הפרויקט, לפי איפה שהסקיל מותקן. היא מסרבת כשקובץ
ה-`.env` נמצא בתוך תיקיית הסקיל, כי העדכון היה מוחק אותו. כדי לבטל את הבדיקה היומית:
`SCHOOL_UPDATE_CHECK=off`.

## הגדרה

פרטי ההתחברות נקראים ממשתני סביבה בלבד, מקובץ `.env` שלא נכנס ל-git. הסקיל טוען את הקובץ הראשון
שקיים מבין:

1. הקובץ ש-`SCHOOL_ENV_FILE` מצביע עליו.
2. `~/.config/israel-school/.env` (מומלץ: נשמר גם אחרי עדכון).
3. `.env` בתיקיית הסקיל.

יצירת הקובץ:

```sh
mkdir -p ~/.config/israel-school
cp ~/.claude/skills/israel-school/.env.example ~/.config/israel-school/.env
chmod 600 ~/.config/israel-school/.env
```

ממלאים רק את האפליקציה שבית הספר משתמש בה.

ערכים עם `#` (נפוץ בסיסמאות) חייבים להיות במירכאות בודדות, למשל `MASHOV_PASSWORD='abc#123'`.
בלי מירכאות, כל מה שאחרי ה-`#` נחתך וההתחברות נכשלת.

לעולם אל תדביקו סיסמה או טוקן בשיחה עם הסוכן. כתבו אותם רק בקובץ או במחזיק המפתחות.

הקובץ הוא לא כספת: הסיסמה שמורה בו כטקסט גלוי. לכן:

- הסקיל מסרב לקובץ שמשתמשים אחרים במחשב יכולים לקרוא, ומציג את פקודת ה-`chmod` שמתקנת זאת.
- אל תשמרו אותו בתיקייה שמסונכרנת לענן (iCloud, Dropbox) או במאגר git, כולל מאגר dotfiles.
- אל תקלידו `export MASHOV_PASSWORD=...` בטרמינל: הפקודה נשמרת בהיסטוריה.
- הדרך הבטוחה יותר היא מחזיק המפתחות של המחשב (בסעיף הבא).

### שמירת הסיסמה במחזיק המפתחות

`MASHOV_PASSWORD`, `SMARTSCHOOL_WEB_TOKEN` ו-`SMARTSCHOOL_BIO_LOGIN` יכולים להישמר במחזיק המפתחות
במקום בקובץ. כשהמשתנה ריק או חסר בקובץ, הסקיל מחפש אותו שם, תחת השירות `israel-school` ובחשבון
בשם המשתנה. ערך שמוגדר בקובץ או בסביבה קודם לזה שבמחזיק.

macOS (Keychain). הפקודה מבקשת להקליד את הסיסמה, כך שהיא לא נשמרת בהיסטוריה:

```sh
security add-generic-password -U -s israel-school -a MASHOV_PASSWORD -w
```

Linux (דרך `secret-tool` של GNOME Keyring או KWallet):

```sh
secret-tool store --label="israel-school MASHOV_PASSWORD" service israel-school account MASHOV_PASSWORD
```

מחיקה: `security delete-generic-password -s israel-school -a MASHOV_PASSWORD` ב-macOS, או
`secret-tool clear service israel-school account MASHOV_PASSWORD` ב-Linux.

אחרי השמירה מוחקים את הערך מהקובץ (משאירים `MASHOV_PASSWORD=` ריק או מוחקים את השורה).

### משו"ב

| משתנה | חובה | תיאור |
|---|---|---|
| `MASHOV_USERNAME` | כן | שם המשתמש במשו"ב |
| `MASHOV_PASSWORD` | כן | הסיסמה במשו"ב |
| `MASHOV_SEMEL` | כן | סמל המוסד |
| `MASHOV_YEAR` | לא | שנת הלימודים לפי השנה שבה היא מסתיימת (תשפ"ז = 2027). ברירת המחדל מחושבת מהתאריך |
| `MASHOV_STUDENT_ID` | לא | מזהה תלמיד, למקרה שלא נמצא תלמיד בתשובת ההתחברות |

איתור סמל המוסד (לא דורש התחברות):

```sh
~/.claude/skills/israel-school/scripts/school mashov schools --query "שם בית הספר"
```

### סמארט סקול

ההתחברות בסיסמה חסומה ב-reCAPTCHA, ולכן הסקיל משתמש בעוגיית `webToken` מהדפדפן.

1. נכנסים ל-https://webtop.smartschool.co.il (ואם מחוברים, מתנתקים קודם).
2. כדי שהטוקן יחזיק כחצי שנה ולא 9 שעות: בקונסולה של כלי המפתחים (F12) מריצים
   `document.cookie = "saveRememberMe=1; path=/; domain=.smartschool.co.il"`, ומיד אחר כך מתחברים.
3. בכלי המפתחים: Application ← Cookies ← מעתיקים את הערך של `webToken` ל-`SMARTSCHOOL_WEB_TOKEN`.

| משתנה | חובה | תיאור |
|---|---|---|
| `SMARTSCHOOL_WEB_TOKEN` | כן, אלא אם הוגדר `SMARTSCHOOL_BIO_LOGIN` | ערך העוגייה `webToken` |
| `SMARTSCHOOL_BIO_LOGIN` | לא | כניסה שמורה של הדפדפן, לחידוש אוטומטי של החיבור |
| `SMARTSCHOOL_UNIQUE_ID`, `SMARTSCHOOL_SELECTED_USER`, `SMARTSCHOOL_DEVICE_ID` | לא | נלווים ל-`SMARTSCHOOL_BIO_LOGIN` |

החידוש האוטומטי יוצר חיבור חדש, ועלול לנתק אתכם מהדפדפן.

### בדיקה

```sh
~/.claude/skills/israel-school/scripts/school mashov students
~/.claude/skills/israel-school/scripts/school webtop check
```

אם ההתחברות למשו"ב נכשלת, תקנו את הפרטים לפני שמנסים שוב: ניסיונות כושלים חוזרים עלולים לנעול
את החשבון. הסקיל לא מנסה שוב בעצמו.

## שימוש

אחרי ההתקנה פשוט שואלים את הסוכן, בעברית או באנגלית. למשל:

- "מה הציונים האחרונים של יואב?"
- "יש שיעורי בית למחר?"
- "תראה לי את מערכת השעות של השבוע הבא"
- "היו חיסורים או איחורים החודש?"
- "יש הודעות חדשות מבית הספר?"

אם בית הספר משתמש באפליקציה אחת בלבד, כדאי לציין אותה ("במשו"ב...") כדי שהסוכן לא ישאל.

אפשר גם להריץ את הכלי ישירות. כל הרצה מדפיסה מסמך JSON יחיד:

```sh
scripts/school help                          # כל הפקודות
scripts/school mashov all                    # כל הנתונים במשו"ב, בהתחברות אחת
scripts/school mashov grades --student 1     # ציונים של התלמיד הראשון בחשבון
scripts/school webtop homework --week=-1     # שיעורי הבית של השבוע הקודם
scripts/school webtop messages --unread      # הודעות שלא נקראו
```

| משו"ב (`mashov`) | סמארט סקול (`webtop`) |
|---|---|
| `students`, `grades`, `homework`, `timetable`, `behavior`, `messages`, `schools`, `all` | `check`, `students`, `grades`, `homework`, `timetable`, `today`, `behavior`, `messages`, `notifications`, `all` |

`--student` מקבל מזהה, שם מלא או מספר סידורי (מ-1). בלי `--student` הפקודה רצה על כל התלמידים בחשבון.
הפירוט המלא נמצא ב-[SKILL.md](SKILL.md).

## רמות הרשאה

`SCHOOL_ACCESS` בקובץ ההגדרות קובע מה מותר:

| ערך | שינויים בנתונים |
|---|---|
| `read` (ברירת מחדל) | חסומים תמיד |
| `full` | כל שינוי מחכה לאישור שלכם |
| `unattended` | יוצאים בלי לשאול. רק להרצות בלי אדם ליד המחשב, כמו משימה מתוזמנת |

ב-`full` יש שתי דרכים לאשר:

- **חלון לכל שינוי:** נפתח חלון במחשב (macOS, או Linux עם `zenity`) שמציג את הכתובת ואת הנתונים
  שיישלחו, עם Allow ו-Deny. אם לא עונים תוך 2 דקות, זה נחשב סירוב.
- **אישור לזמן מוגבל:** מריצים בעצמכם בטרמינל `scripts/school grant --minutes 15` (עד 120 דקות)
  ומקלידים את הקוד שמוצג. `scripts/school revoke` מבטל מיד. הסוכן לא יכול להריץ `grant`,
  כי הוא דורש אדם מול טרמינל.

`--read-only` מגביל הרצה בודדת לקריאה בלבד, בכל רמה.

ההגנות האלה מונעות טעויות והוראות זדוניות שמגיעות בתוכן (למשל בהודעה מבית הספר). הן לא עוצרות
סוכן שפועל בכוונה נגדכם באותו משתמש במחשב.

## פרטיות ואבטחה

- הסיסמאות והטוקנים נשארים בקובץ ההגדרות או במחזיק המפתחות במחשב שלכם, ונשלחים רק לשרתי משו"ב
  או סמארט סקול.
- הכלי לא כותב לוגים, ולא מדפיס סיסמאות, טוקנים או גוף תשובות בהודעות שגיאה.
- הבקשות יוצאות רק לכתובת של האפליקציה, ולא עוקבות אחרי הפניות (redirects). חוץ מהן יש בקשה
  אחת ביום ל-GitHub, שבודקת את מספר הגרסה בלי לשלוח שום מידע עליכם.
- הפלט כולל מידע אישי על קטינים. הסקיל מנחה את הסוכן להשתמש בו רק כדי לענות לכם, ולא לשמור או לשלוח אותו.

## פיתוח

```sh
npm ci
npm run check      # tsc --noEmit, biome, vitest (כל קריאות ה-HTTP מדומות)
scripts/school help
```

הקוד מחולק ל-`src/core` (משותף), `src/mashov` ו-`src/webtop`. Biome אוכף שהליבה לא מייבאת מהאפליקציות,
ושהאפליקציות לא מייבאות זו מזו.

בדיקת העדכונים משווה את `version` שב-`package.json` לזה שב-`main`. כדי שמשתמשים יקבלו הצעה
לעדכן, מעלים את הגרסה בכל שינוי שמתמזג.

## הבהרה

זה פרויקט קהילתי ולא רשמי. הוא לא קשור למשו"ב או לסמארט סקול, ולא מאושר על ידן. הוא משתמש בממשקים
הפנימיים של האתרים, שעלולים להשתנות בלי הודעה ולשבור אותו. השתמשו בו רק עם החשבון שלכם ובאחריותכם.

## דיווח על בעיות

נתקלתם בתקלה, בפקודה שהפסיקה לעבוד, בנתונים שלא תואמים את מה שרואים באתר, בטעות בתיעוד
או ברעיון לשיפור? פתחו [issue](https://github.com/ekrako/school_israel_skill/issues/new).
האתרים משתנים בלי הודעה, כך שדיווח הוא לרוב הדרך היחידה לדעת שמשהו נשבר.

כדאי לצרף:

- הפקודה שהרצתם, וה-`type` וה-`message` של השגיאה.
- הגרסה (`version` ב-`package.json` של הסקיל), מערכת ההפעלה וגרסת Node.
- מה ציפיתם שיקרה ומה קרה בפועל.

אל תצרפו סיסמאות, טוקנים, סמל מוסד או נתונים של תלמידים. אם צריך להראות פלט, החליפו שמות,
ציונים ומזהים בערכים מומצאים.

בעיית אבטחה מדווחים בפרטיות, לא ב-issue ציבורי, דרך
[Security advisories](https://github.com/ekrako/school_israel_skill/security/advisories/new).

## מקורות ורישיון

- https://github.com/t0mer/pymashov (Apache-2.0): שימש רק כתיעוד של נקודות הקצה. לא הועתק קוד.
- https://github.com/Shanksg/smartschool-webtop (MIT): חלק מהקוד הותאם. ראו [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

רישיון: MIT. ראו [LICENSE](LICENSE).

</div>
