import React, { createContext, useContext, useState, useEffect } from 'react';

// Language translations
const translations = {
  de: {
    // Navigation
    dashboard: 'Dashboard',
    analyse: 'Analyse',
    wachstum: 'Wachstum',
    kunden: 'Kunden',
    standort: 'Standort',
    reports: 'Reports',
    market: 'Markt',
    abtests: 'A/B Tests',
    tasks: 'Tasks',
    alerts: 'Alerts',
    settings: 'Einstellungen',
    more: 'Mehr',

    // Settings tabs
    account: 'Konto',
    team: 'Team',
    dataSources: 'Datenquellen',
    notifications: 'Benachrichtigungen',
    subscription: 'Abonnement',
    language: 'Sprache',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',
    russian: 'Русский',

    // Common buttons
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    close: 'Schließen',
    add: 'Hinzufügen',
    remove: 'Entfernen',
    logout: 'Abmelden',

    // Account
    profile: 'Profil',
    name: 'Name',
    email: 'E-Mail',
    password: 'Passwort',
    changePassword: 'Passwort ändern',
    currentPassword: 'Aktuelles Passwort',
    newPassword: 'Neues Passwort',
    confirmPassword: 'Passwort bestätigen',
    deleteAccount: 'Konto löschen',
    profileSaved: 'Profil gespeichert.',
    passwordChanged: 'Passwort geändert.',
    accountDeleted: 'Konto gelöscht.',

    // Reports
    createReport: 'Report erstellen',
    monthlyReport: 'Monatsreport',
    investorReport: 'Investoren-Report',
    teamReport: 'Team-Report',
    generateReport: 'Report generieren',
    saveInsight: 'Als Erkenntnis merken',
    exportPDF: 'PDF exportieren',
    insights: 'Erkenntnisse',
    savedInsights: 'Gespeicherte Erkenntnisse',
    chatHistory: 'Chat-History',
    aiSummary: 'KI-Zusammenfassung',
    searchInsights: 'Erkenntnisse durchsuchen...',

    // Dashboard
    goodMorning: 'Guten Morgen',
    goodDay: 'Guten Tag',
    goodEvening: 'Guten Abend',
    weeklyReview: 'Wöchentliches Review',
    recommendationsCompleted: 'Empfehlungen umgesetzt',
    revenue: 'Umsatz',
    nextRecommendations: 'Nächste Empfehlungen',
    goalAdjustment: 'Ziel-Anpassung',
    tooEasy: 'Zu einfach',
    perfect: 'Perfekt',
    tooHard: 'Zu schwer',
    suggestedTarget: 'Empfohlenes Ziel',
    accept: 'Akzeptieren',
    dismiss: 'Ablehnen',

    // Messages
    success: 'Erfolgreich',
    error: 'Fehler',
    loading: 'Wird geladen...',
    noData: 'Keine Daten verfügbar',
    empty: 'Leer',
  },
  en: {
    // Navigation
    dashboard: 'Dashboard',
    analyse: 'Analysis',
    wachstum: 'Growth',
    kunden: 'Customers',
    standort: 'Location',
    reports: 'Reports',
    market: 'Market',
    abtests: 'A/B Tests',
    tasks: 'Tasks',
    alerts: 'Alerts',
    settings: 'Settings',
    more: 'More',

    // Settings tabs
    account: 'Account',
    team: 'Team',
    dataSources: 'Data Sources',
    notifications: 'Notifications',
    subscription: 'Subscription',
    language: 'Language',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',

    // Common buttons
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    add: 'Add',
    remove: 'Remove',
    logout: 'Logout',

    // Account
    profile: 'Profile',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    changePassword: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password',
    deleteAccount: 'Delete Account',
    profileSaved: 'Profile saved.',
    passwordChanged: 'Password changed.',
    accountDeleted: 'Account deleted.',

    // Reports
    createReport: 'Create Report',
    monthlyReport: 'Monthly Report',
    investorReport: 'Investor Report',
    teamReport: 'Team Report',
    generateReport: 'Generate Report',
    saveInsight: 'Save as Insight',
    exportPDF: 'Export PDF',
    insights: 'Insights',
    savedInsights: 'Saved Insights',
    chatHistory: 'Chat History',
    aiSummary: 'AI Summary',
    searchInsights: 'Search insights...',

    // Dashboard
    goodMorning: 'Good Morning',
    goodDay: 'Good Day',
    goodEvening: 'Good Evening',
    weeklyReview: 'Weekly Review',
    recommendationsCompleted: 'Recommendations Completed',
    revenue: 'Revenue',
    nextRecommendations: 'Next Recommendations',
    goalAdjustment: 'Goal Adjustment',
    tooEasy: 'Too Easy',
    perfect: 'Perfect',
    tooHard: 'Too Hard',
    suggestedTarget: 'Suggested Target',
    accept: 'Accept',
    dismiss: 'Dismiss',

    // Messages
    success: 'Success',
    error: 'Error',
    loading: 'Loading...',
    noData: 'No data available',
    empty: 'Empty',
  },
  es: {
    // Navigation
    dashboard: 'Panel de Control',
    analyse: 'Análisis',
    wachstum: 'Crecimiento',
    kunden: 'Clientes',
    standort: 'Ubicación',
    reports: 'Reportes',
    market: 'Mercado',
    abtests: 'Pruebas A/B',
    tasks: 'Tareas',
    alerts: 'Alertas',
    settings: 'Configuración',
    more: 'Más',

    // Settings tabs
    account: 'Cuenta',
    team: 'Equipo',
    dataSources: 'Fuentes de Datos',
    notifications: 'Notificaciones',
    subscription: 'Suscripción',
    language: 'Idioma',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',

    // Common buttons
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    close: 'Cerrar',
    add: 'Agregar',
    remove: 'Quitar',
    logout: 'Cerrar Sesión',

    // Account
    profile: 'Perfil',
    name: 'Nombre',
    email: 'Correo Electrónico',
    password: 'Contraseña',
    changePassword: 'Cambiar Contraseña',
    currentPassword: 'Contraseña Actual',
    newPassword: 'Nueva Contraseña',
    confirmPassword: 'Confirmar Contraseña',
    deleteAccount: 'Eliminar Cuenta',
    profileSaved: 'Perfil guardado.',
    passwordChanged: 'Contraseña cambiada.',
    accountDeleted: 'Cuenta eliminada.',

    // Reports
    createReport: 'Crear Reporte',
    monthlyReport: 'Reporte Mensual',
    investorReport: 'Reporte para Inversores',
    teamReport: 'Reporte del Equipo',
    generateReport: 'Generar Reporte',
    saveInsight: 'Guardar como Insight',
    exportPDF: 'Exportar PDF',
    insights: 'Insights',
    savedInsights: 'Insights Guardados',
    chatHistory: 'Historial de Chat',
    aiSummary: 'Resumen de IA',
    searchInsights: 'Buscar insights...',

    // Dashboard
    goodMorning: 'Buenos Días',
    goodDay: 'Buen Día',
    goodEvening: 'Buenas Noches',
    weeklyReview: 'Revisión Semanal',
    recommendationsCompleted: 'Recomendaciones Completadas',
    revenue: 'Ingresos',
    nextRecommendations: 'Próximas Recomendaciones',
    goalAdjustment: 'Ajuste de Objetivo',
    tooEasy: 'Muy Fácil',
    perfect: 'Perfecto',
    tooHard: 'Muy Difícil',
    suggestedTarget: 'Objetivo Sugerido',
    accept: 'Aceptar',
    dismiss: 'Rechazar',

    // Messages
    success: 'Éxito',
    error: 'Error',
    loading: 'Cargando...',
    noData: 'No hay datos disponibles',
    empty: 'Vacío',
  },
  fr: {
    // Navigation
    dashboard: 'Tableau de Bord',
    analyse: 'Analyse',
    wachstum: 'Croissance',
    kunden: 'Clients',
    standort: 'Localisation',
    reports: 'Rapports',
    market: 'Marché',
    abtests: 'Tests A/B',
    tasks: 'Tâches',
    alerts: 'Alertes',
    settings: 'Paramètres',
    more: 'Plus',

    // Settings tabs
    account: 'Compte',
    team: 'Équipe',
    dataSources: 'Sources de Données',
    notifications: 'Notifications',
    subscription: 'Abonnement',
    language: 'Langue',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',

    // Common buttons
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    close: 'Fermer',
    add: 'Ajouter',
    remove: 'Retirer',
    logout: 'Déconnexion',

    // Account
    profile: 'Profil',
    name: 'Nom',
    email: 'E-mail',
    password: 'Mot de Passe',
    changePassword: 'Changer le Mot de Passe',
    currentPassword: 'Mot de Passe Actuel',
    newPassword: 'Nouveau Mot de Passe',
    confirmPassword: 'Confirmer le Mot de Passe',
    deleteAccount: 'Supprimer le Compte',
    profileSaved: 'Profil enregistré.',
    passwordChanged: 'Mot de passe modifié.',
    accountDeleted: 'Compte supprimé.',

    // Reports
    createReport: 'Créer un Rapport',
    monthlyReport: 'Rapport Mensuel',
    investorReport: 'Rapport pour Investisseurs',
    teamReport: 'Rapport d\'Équipe',
    generateReport: 'Générer un Rapport',
    saveInsight: 'Enregistrer comme Insight',
    exportPDF: 'Exporter en PDF',
    insights: 'Insights',
    savedInsights: 'Insights Enregistrés',
    chatHistory: 'Historique de Chat',
    aiSummary: 'Résumé IA',
    searchInsights: 'Rechercher des insights...',

    // Dashboard
    goodMorning: 'Bonjour',
    goodDay: 'Bon Jour',
    goodEvening: 'Bonsoir',
    weeklyReview: 'Examen Hebdomadaire',
    recommendationsCompleted: 'Recommandations Complétées',
    revenue: 'Chiffre d\'Affaires',
    nextRecommendations: 'Prochaines Recommandations',
    goalAdjustment: 'Ajustement d\'Objectif',
    tooEasy: 'Trop Facile',
    perfect: 'Parfait',
    tooHard: 'Trop Difficile',
    suggestedTarget: 'Objectif Suggéré',
    accept: 'Accepter',
    dismiss: 'Rejeter',

    // Messages
    success: 'Succès',
    error: 'Erreur',
    loading: 'Chargement...',
    noData: 'Aucune donnée disponible',
    empty: 'Vide',
  },
  it: {
    // Navigation
    dashboard: 'Dashboard',
    analyse: 'Analisi',
    wachstum: 'Crescita',
    kunden: 'Clienti',
    standort: 'Posizione',
    reports: 'Report',
    market: 'Mercato',
    abtests: 'Test A/B',
    tasks: 'Attività',
    alerts: 'Avvisi',
    settings: 'Impostazioni',
    more: 'Altro',

    // Settings tabs
    account: 'Account',
    team: 'Team',
    dataSources: 'Fonti Dati',
    notifications: 'Notifiche',
    subscription: 'Abbonamento',
    language: 'Lingua',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',

    // Common buttons
    save: 'Salva',
    cancel: 'Annulla',
    delete: 'Elimina',
    edit: 'Modifica',
    close: 'Chiudi',
    add: 'Aggiungi',
    remove: 'Rimuovi',
    logout: 'Disconnetti',

    // Account
    profile: 'Profilo',
    name: 'Nome',
    email: 'E-mail',
    password: 'Password',
    changePassword: 'Cambia Password',
    currentPassword: 'Password Attuale',
    newPassword: 'Nuova Password',
    confirmPassword: 'Conferma Password',
    deleteAccount: 'Elimina Account',
    profileSaved: 'Profilo salvato.',
    passwordChanged: 'Password modificata.',
    accountDeleted: 'Account eliminato.',

    // Reports
    createReport: 'Crea Report',
    monthlyReport: 'Report Mensile',
    investorReport: 'Report per Investitori',
    teamReport: 'Report del Team',
    generateReport: 'Genera Report',
    saveInsight: 'Salva come Insight',
    exportPDF: 'Esporta PDF',
    insights: 'Insight',
    savedInsights: 'Insight Salvati',
    chatHistory: 'Cronologia Chat',
    aiSummary: 'Riepilogo IA',
    searchInsights: 'Cerca insight...',

    // Dashboard
    goodMorning: 'Buongiorno',
    goodDay: 'Buon Giorno',
    goodEvening: 'Buonasera',
    weeklyReview: 'Revisione Settimanale',
    recommendationsCompleted: 'Raccomandazioni Completate',
    revenue: 'Fatturato',
    nextRecommendations: 'Prossime Raccomandazioni',
    goalAdjustment: 'Adeguamento Obiettivo',
    tooEasy: 'Troppo Facile',
    perfect: 'Perfetto',
    tooHard: 'Troppo Difficile',
    suggestedTarget: 'Obiettivo Suggerito',
    accept: 'Accetta',
    dismiss: 'Ignora',

    // Messages
    success: 'Successo',
    error: 'Errore',
    loading: 'Caricamento...',
    noData: 'Nessun dato disponibile',
    empty: 'Vuoto',
  },
  pt: {
    // Navigation
    dashboard: 'Painel',
    analyse: 'Análise',
    wachstum: 'Crescimento',
    kunden: 'Clientes',
    standort: 'Localização',
    reports: 'Relatórios',
    market: 'Mercado',
    abtests: 'Testes A/B',
    tasks: 'Tarefas',
    alerts: 'Alertas',
    settings: 'Configurações',
    more: 'Mais',

    // Settings tabs
    account: 'Conta',
    team: 'Equipa',
    dataSources: 'Fontes de Dados',
    notifications: 'Notificações',
    subscription: 'Subscrição',
    language: 'Idioma',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',

    // Common buttons
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    close: 'Fechar',
    add: 'Adicionar',
    remove: 'Remover',
    logout: 'Terminar Sessão',

    // Account
    profile: 'Perfil',
    name: 'Nome',
    email: 'E-mail',
    password: 'Palavra-passe',
    changePassword: 'Alterar Palavra-passe',
    currentPassword: 'Palavra-passe Atual',
    newPassword: 'Nova Palavra-passe',
    confirmPassword: 'Confirmar Palavra-passe',
    deleteAccount: 'Eliminar Conta',
    profileSaved: 'Perfil guardado.',
    passwordChanged: 'Palavra-passe alterada.',
    accountDeleted: 'Conta eliminada.',

    // Reports
    createReport: 'Criar Relatório',
    monthlyReport: 'Relatório Mensal',
    investorReport: 'Relatório para Investidores',
    teamReport: 'Relatório da Equipa',
    generateReport: 'Gerar Relatório',
    saveInsight: 'Guardar como Insight',
    exportPDF: 'Exportar PDF',
    insights: 'Insights',
    savedInsights: 'Insights Guardados',
    chatHistory: 'Histórico de Chat',
    aiSummary: 'Resumo de IA',
    searchInsights: 'Pesquisar insights...',

    // Dashboard
    goodMorning: 'Bom Dia',
    goodDay: 'Boa Tarde',
    goodEvening: 'Boa Noite',
    weeklyReview: 'Revisão Semanal',
    recommendationsCompleted: 'Recomendações Concluídas',
    revenue: 'Receita',
    nextRecommendations: 'Próximas Recomendações',
    goalAdjustment: 'Ajuste de Objetivo',
    tooEasy: 'Muito Fácil',
    perfect: 'Perfeito',
    tooHard: 'Muito Difícil',
    suggestedTarget: 'Objetivo Sugerido',
    accept: 'Aceitar',
    dismiss: 'Ignorar',

    // Messages
    success: 'Sucesso',
    error: 'Erro',
    loading: 'A carregar...',
    noData: 'Sem dados disponíveis',
    empty: 'Vazio',
  },
  zh: {
    // Navigation
    dashboard: '仪表盘',
    analyse: '分析',
    wachstum: '增长',
    kunden: '客户',
    standort: '位置',
    reports: '报告',
    market: '市场',
    abtests: 'A/B 测试',
    tasks: '任务',
    alerts: '提醒',
    settings: '设置',
    more: '更多',

    // Settings tabs
    account: '账户',
    team: '团队',
    dataSources: '数据源',
    notifications: '通知',
    subscription: '订阅',
    language: '语言',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',
    russian: 'Русский',

    // Common buttons
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    close: '关闭',
    add: '添加',
    remove: '移除',
    logout: '退出登录',

    // Account
    profile: '个人资料',
    name: '姓名',
    email: '电子邮件',
    password: '密码',
    changePassword: '修改密码',
    currentPassword: '当前密码',
    newPassword: '新密码',
    confirmPassword: '确认密码',
    deleteAccount: '删除账户',
    profileSaved: '个人资料已保存。',
    passwordChanged: '密码已修改。',
    accountDeleted: '账户已删除。',

    // Reports
    createReport: '创建报告',
    monthlyReport: '月度报告',
    investorReport: '投资人报告',
    teamReport: '团队报告',
    generateReport: '生成报告',
    saveInsight: '保存为洞察',
    exportPDF: '导出 PDF',
    insights: '洞察',
    savedInsights: '已保存洞察',
    chatHistory: '聊天记录',
    aiSummary: 'AI 摘要',
    searchInsights: '搜索洞察...',

    // Dashboard
    goodMorning: '早上好',
    goodDay: '下午好',
    goodEvening: '晚上好',
    weeklyReview: '每周回顾',
    recommendationsCompleted: '已完成建议',
    revenue: '营收',
    nextRecommendations: '下一步建议',
    goalAdjustment: '目标调整',
    tooEasy: '太简单',
    perfect: '完美',
    tooHard: '太困难',
    suggestedTarget: '建议目标',
    accept: '接受',
    dismiss: '忽略',

    // Messages
    success: '成功',
    error: '错误',
    loading: '加载中...',
    noData: '暂无数据',
    empty: '空',
  },
  ru: {
    // Navigation
    dashboard: 'Панель',
    analyse: 'Анализ',
    wachstum: 'Рост',
    kunden: 'Клиенты',
    standort: 'Местоположение',
    reports: 'Отчёты',
    market: 'Рынок',
    abtests: 'A/B Тесты',
    tasks: 'Задачи',
    alerts: 'Оповещения',
    settings: 'Настройки',
    more: 'Ещё',

    // Settings tabs
    account: 'Аккаунт',
    team: 'Команда',
    dataSources: 'Источники данных',
    notifications: 'Уведомления',
    subscription: 'Подписка',
    language: 'Язык',

    // Language names
    german: 'Deutsch',
    english: 'English',
    spanish: 'Español',
    french: 'Français',
    italian: 'Italiano',
    portuguese: 'Português',
    mandarin: '中文',
    russian: 'Русский',

    // Common buttons
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    edit: 'Редактировать',
    close: 'Закрыть',
    add: 'Добавить',
    remove: 'Удалить',
    logout: 'Выйти',

    // Account
    profile: 'Профиль',
    name: 'Имя',
    email: 'Эл. почта',
    password: 'Пароль',
    changePassword: 'Изменить пароль',
    currentPassword: 'Текущий пароль',
    newPassword: 'Новый пароль',
    confirmPassword: 'Подтвердить пароль',
    deleteAccount: 'Удалить аккаунт',
    profileSaved: 'Профиль сохранён.',
    passwordChanged: 'Пароль изменён.',
    accountDeleted: 'Аккаунт удалён.',

    // Reports
    createReport: 'Создать отчёт',
    monthlyReport: 'Ежемесячный отчёт',
    investorReport: 'Отчёт для инвесторов',
    teamReport: 'Командный отчёт',
    generateReport: 'Сгенерировать отчёт',
    saveInsight: 'Сохранить как Insight',
    exportPDF: 'Экспорт PDF',
    insights: 'Инсайты',
    savedInsights: 'Сохранённые инсайты',
    chatHistory: 'История чата',
    aiSummary: 'Резюме ИИ',
    searchInsights: 'Поиск инсайтов...',

    // Dashboard
    goodMorning: 'Доброе утро',
    goodDay: 'Добрый день',
    goodEvening: 'Добрый вечер',
    weeklyReview: 'Еженедельный обзор',
    recommendationsCompleted: 'Выполнено рекомендаций',
    revenue: 'Выручка',
    nextRecommendations: 'Следующие рекомендации',
    goalAdjustment: 'Корректировка цели',
    tooEasy: 'Слишком легко',
    perfect: 'Идеально',
    tooHard: 'Слишком сложно',
    suggestedTarget: 'Предложенная цель',
    accept: 'Принять',
    dismiss: 'Отклонить',

    // Messages
    success: 'Успешно',
    error: 'Ошибка',
    loading: 'Загрузка...',
    noData: 'Нет данных',
    empty: 'Пусто',
  },
};

// Create context
const LanguageContext = createContext();

// Provider component
export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Get saved language from localStorage
    const saved = localStorage.getItem('app-language');
    return saved || 'de';
  });

  // Save language to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('app-language', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (key) => {
    return translations[language]?.[key] || translations['de'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook to use language context
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
