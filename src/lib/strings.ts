/**
 * Every user-facing string, in one place for later translation.
 * Plain language, short sentences.
 */
export const strings = {
  app: {
    name: "Ovation",
    tagline: "Record, total and report donations at honouring events.",
    skipToContent: "Skip to main content",
    loading: "Loading…",
  },

  roles: {
    ADMIN: "Admin",
    EDITOR: "Editor",
    VIEWER: "Viewer",
  },

  roleCan: {
    ADMIN: "Can do everything, including managing members and invite codes.",
    EDITOR: "Can add events, awardees and donations, and see everything.",
    VIEWER: "Can see events, donations, totals and exports.",
  },

  status: {
    pledged: "Pledged",
    received: "Received",
  },

  errors: {
    validation: "Some details need fixing.",
    unauthorized: "Please sign in again.",
    forbidden: "Your role in this organisation cannot do this.",
    notFound: "We could not find that, or it is not in your organisation.",
    conflict: "This could not be saved because something changed.",
    gone: "This invite code is no longer valid. Ask for a new one.",
    rateLimited: "Too many attempts. Please wait a minute and try again.",
    server: "Something went wrong on our side. Please try again.",
    network: "We could not reach Ovation. Check your connection and try again.",
    timeout: "Ovation took too long to answer. Please try again.",
    unexpected: "Something went wrong. Please try again.",
    summaryTitle: "There is a problem",
  },

  form: {
    required: "(required)",
    show: "Show",
    hide: "Hide",
    showPassword: "Show password",
    wait: "Please wait…",
  },

  validation: {
    nameRequired: "Enter your name.",
    nameTooLong: "Name must be 100 characters or fewer.",
    emailRequired: "Enter your email address.",
    emailInvalid: "Enter an email address like name@example.com.",
    passwordRequired: "Enter your password.",
    passwordTooShort: "Password must be at least 8 characters.",
    passwordTooLong: "Password must be 128 characters or fewer.",
    passwordsDiffer: "The new password must be different from the current one.",
    currentPasswordRequired: "Enter your current password.",
    orgNameRequired: "Enter the organisation's name.",
    orgNameTooShort: "Name must be at least 2 characters.",
    orgNameTooLong: "Name must be 120 characters or fewer.",
    codeRequired: "Enter the invite code.",
    codeInvalid: "Invite codes look like OVN-7K2P-QX9M.",
  },

  coldStart: {
    waking: "Waking the server. This can take a minute.",
    ready: "Connected.",
    unreachable: "We cannot reach Ovation right now. We will keep trying.",
    retry: "Try again",
  },

  offline: {
    title: "You are offline",
    body: "Ovation needs a connection for this page. Your work on this device is safe. Reconnect and try again.",
    retry: "Try again",
    banner: "You are offline. Changes cannot be saved until you reconnect.",
  },

  login: {
    title: "Sign in",
    intro: "Sign in to record and total donations for your organisation.",
    email: "Email address",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    failed: "That email and password do not match an account.",
    noAccount: "New to Ovation?",
    register: "Create an account",
    recoveryUnavailable:
      "Forgot your password? Password recovery is not available yet. Ask your organisation's admin for help.",
    sessionExpired: "Your session ended. Please sign in again.",
    signedOut: "You have signed out.",
  },

  register: {
    title: "Create an account",
    intro: "Create an account to start or join an organisation.",
    name: "Your name",
    nameHint: "As people in your organisation know you.",
    email: "Email address",
    password: "Password",
    passwordHint: "At least 8 characters.",
    submit: "Create account",
    submitting: "Creating account…",
    emailTaken: "An account with this email already exists. Sign in instead.",
    haveAccount: "Already have an account?",
    login: "Sign in",
  },

  join: {
    title: "Join an organisation",
    intro: "Enter the invite code someone shared with you.",
    code: "Invite code",
    codeHint: "For example OVN-7K2P-QX9M. Capitals, spaces and dashes do not matter.",
    check: "Check code",
    checking: "Checking…",
    preview: (org: string, role: string) => `Join ${org} as ${role}?`,
    accept: "Join",
    accepting: "Joining…",
    different: "Use a different code",
    alreadyMember: (org: string) => `You are already a member of ${org}.`,
    openOrg: "Open organisation",
    joined: (org: string) => `You joined ${org}.`,
    notFound: "We could not find that invite code. Check it and try again.",
    signInFirst: "Sign in or create an account to join. We will keep your code.",
    conflict: "You are already a member of this organisation.",
  },

  orgs: {
    title: "Your organisations",
    intro: "Choose an organisation to work on.",
    empty: "You are not in any organisation yet.",
    emptyHint: "Create one, or join with an invite code.",
    create: "Create organisation",
    join: "Join with a code",
    role: "Your role",
    open: "Open",
    newTitle: "Create an organisation",
    newIntro: "For example a town union, a church or a family. You will be its admin.",
    name: "Organisation name",
    nameHint: "For example Umuoji Town Union, Lagos branch.",
    submit: "Create organisation",
    submitting: "Creating…",
    created: (name: string) => `${name} created.`,
    switcher: "Organisation",
    switchTo: (name: string) => `Switch to ${name}`,
    current: "current",
    allOrgs: "All organisations",
  },

  org: {
    events: "Events",
    eventsPlaceholder:
      "Events will appear here. Creating and viewing events arrives in the next update.",
    event: "Event",
    eventPlaceholder: "Event details, awardees and totals arrive in the next update.",
    members: "Members",
    membersPlaceholder: "Member management arrives in the next update.",
    invites: "Invite codes",
    invitesPlaceholder: "Creating and revoking invite codes arrives in the next update.",
    audit: "Audit log",
    auditPlaceholder: "The audit log arrives in the next update.",
    adminOnly: "Only admins of this organisation can see this page.",
    nav: "Organisation",
  },

  settings: {
    title: "Settings",
    account: "Account",
    signedInAs: (name: string, email: string) => `Signed in as ${name} (${email}).`,
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    newPasswordHint: "At least 8 characters. Other devices will be signed out.",
    savePassword: "Change password",
    savingPassword: "Changing…",
    passwordChanged: "Password changed. Other devices have been signed out.",
    wrongPassword: "Your current password is not right.",
    appearance: "Appearance",
    theme: "Theme",
    themeSystem: "Match device",
    themeLight: "Light",
    themeDark: "Dark",
    sessions: "Sign out",
    logout: "Sign out",
    loggingOut: "Signing out…",
    logoutAll: "Sign out of all devices",
    logoutAllHint:
      "Use this if a phone was lost or shared. Every device will need to sign in again.",
    logoutAllConfirmTitle: "Sign out of all devices?",
    logoutAllConfirmBody:
      "Every device signed in to your account, including this one, will be signed out.",
    logoutAllConfirm: "Sign out everywhere",
    cancel: "Cancel",
    install: "Install app",
    installTitle: "Install Ovation",
    installHint: "Add Ovation to your home screen so it opens like an app.",
    installed: "Ovation is installed on this device.",
    installUnavailable:
      "Your browser has not offered installation yet. You can use the browser menu instead.",
    recoveryNote: "Password recovery by email is not available yet.",
  },

  header: {
    menu: "Account menu",
    settings: "Settings",
    logout: "Sign out",
    install: "Install app",
    primaryNav: "Main",
  },

  pwa: {
    updateAvailable: "A new version of Ovation is available.",
    reload: "Reload",
    dismiss: "Dismiss",
    iosHint: "To install Ovation, tap Share, then Add to Home Screen.",
    iosHintDismiss: "Dismiss install hint",
  },

  session: {
    endingSoon:
      "You have been offline for a long time. Connect to the internet soon to stay signed in.",
  },

  notFound: {
    title: "Page not found",
    body: "We could not find that page.",
    home: "Go to your organisations",
  },

  theme: {
    toggle: "Theme",
  },
} as const;

export type Strings = typeof strings;
