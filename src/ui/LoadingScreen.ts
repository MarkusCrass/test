import type { Lang } from '../config/locales';

export type LoadingStage = 'starting' | 'characters' | 'arena' | 'finishing';
const texts: Record<Lang, { badge: string; subtitle: string; stages: Record<LoadingStage, string>; slow: string; failed: string; fatal: string; retry: string; proceed: string }> = {
  ru: { badge: '3D арена на выживание', subtitle: 'Арена ждёт своих героев', stages: { starting: 'Готовим игру…', characters: 'Собираем героев и их снаряжение…', arena: 'Строим арену и расставляем декорации…', finishing: 'Последние приготовления…' }, slow: 'Загрузка занимает больше времени, чем обычно.', failed: 'Не все ресурсы удалось загрузить. Можно попробовать снова или продолжить с упрощённой картинкой.', fatal: 'Не удалось запустить 3D-графику. Проверьте аппаратное ускорение и попробуйте снова.', retry: 'Попробовать снова', proceed: 'Продолжить без ожидания' },
  en: { badge: '3D survival arena', subtitle: 'The arena awaits', stages: { starting: 'Getting the game ready…', characters: 'Preparing heroes and their gear…', arena: 'Building the arena and scenery…', finishing: 'Putting the finishing touches on…' }, slow: 'Loading is taking longer than usual.', failed: 'Some resources could not be loaded. Retry or continue with fallback graphics.', fatal: 'Could not start 3D graphics. Check hardware acceleration and try again.', retry: 'Try again', proceed: 'Continue without waiting' },
  tr: { badge: '3D hayatta kalma arenası', subtitle: 'Arena kahramanlarını bekliyor', stages: { starting: 'Oyun hazırlanıyor…', characters: 'Kahramanlar ve ekipmanları hazırlanıyor…', arena: 'Arena ve çevresi hazırlanıyor…', finishing: 'Son hazırlıklar yapılıyor…' }, slow: 'Yükleme normalden uzun sürüyor.', failed: 'Bazı kaynaklar yüklenemedi. Tekrar deneyebilir veya basit grafiklerle devam edebilirsiniz.', fatal: '3D grafik başlatılamadı. Donanım hızlandırmasını kontrol edin ve tekrar deneyin.', retry: 'Tekrar dene', proceed: 'Beklemeden devam et' },
  es: { badge: 'Arena de supervivencia 3D', subtitle: 'La arena te espera', stages: { starting: 'Preparando el juego…', characters: 'Preparando héroes y equipo…', arena: 'Construyendo la arena y el escenario…', finishing: 'Últimos preparativos…' }, slow: 'La carga está tardando más de lo habitual.', failed: 'No se pudieron cargar algunos recursos. Reintenta o continúa con gráficos alternativos.', fatal: 'No se pudieron iniciar los gráficos 3D. Comprueba la aceleración por hardware y vuelve a intentarlo.', retry: 'Reintentar', proceed: 'Continuar sin esperar' },
  ar: { badge: 'ساحة بقاء ثلاثية الأبعاد', subtitle: 'الساحة تنتظر أبطالها', stages: { starting: 'جارٍ تجهيز اللعبة…', characters: 'جارٍ إعداد الأبطال ومعداتهم…', arena: 'جارٍ بناء الساحة والمشهد…', finishing: 'اللمسات الأخيرة…' }, slow: 'يستغرق التحميل وقتاً أطول من المعتاد.', failed: 'تعذر تحميل بعض الموارد. أعد المحاولة أو تابع بالرسومات البديلة.', fatal: 'تعذر تشغيل الرسومات ثلاثية الأبعاد. تحقق من تسريع الأجهزة وحاول مجدداً.', retry: 'حاول مجدداً', proceed: 'المتابعة دون انتظار' },
};

/** Keeps the boot overlay separate from the UI root, which UIManager replaces. */
export class LoadingScreen {
  private readonly root = document.getElementById('boot-splash');
  private readonly status = document.getElementById('boot-status');
  private readonly badge = document.getElementById('boot-badge-text');
  private readonly subtitle = document.getElementById('boot-subtitle');
  private readonly hint = document.getElementById('boot-hint');
  private readonly retry = document.getElementById('boot-retry') as HTMLButtonElement | null;
  private readonly proceed = document.getElementById('boot-continue') as HTMLButtonElement | null;
  private readonly uiRoot = document.getElementById('ui-root');
  private stage: LoadingStage = 'starting';
  private problem: 'slow' | 'failed' | 'fatal' | null = null;
  private language: Lang;
  private finished = false;
  private continueCallback: (() => void) | null = null;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(language: Lang, timeoutMs = 30000) {
    this.language = language;
    this.render();
    this.retry?.addEventListener('click', () => window.location.reload());
    this.proceed?.addEventListener('click', () => this.continueCallback?.());
    this.timer = setTimeout(() => this.showProblem('slow'), timeoutMs);
  }

  setLanguage(language: Lang): void { this.language = language; this.render(); }
  setStage(stage: LoadingStage): void { if (!this.finished) { this.stage = stage; this.render(); } }
  allowContinue(callback: () => void): void { this.continueCallback = callback; this.render(); }
  showProblem(problem: 'slow' | 'failed' | 'fatal'): void {
    if (this.finished || (this.problem === 'fatal' && problem === 'slow')) return;
    this.problem = problem;
    this.render();
  }
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    this.root?.remove();
    this.uiRoot?.removeAttribute('inert');
    this.uiRoot?.removeAttribute('aria-hidden');
  }
  private render(): void {
    const text = texts[this.language];
    if (this.badge) this.badge.textContent = text.badge;
    if (this.subtitle) this.subtitle.textContent = text.subtitle;
    if (this.status) this.status.textContent = text.stages[this.stage];
    if (this.hint) { this.hint.textContent = this.problem ? text[this.problem] : ''; this.hint.hidden = !this.problem; }
    if (this.retry) { this.retry.textContent = text.retry; this.retry.hidden = !this.problem; }
    if (this.proceed) { this.proceed.textContent = text.proceed; this.proceed.hidden = !this.problem || this.problem === 'fatal' || !this.continueCallback; }
    if (this.root) this.root.dir = this.language === 'ar' ? 'rtl' : 'ltr';
  }
}
