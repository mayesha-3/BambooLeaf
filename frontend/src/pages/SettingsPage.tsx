import { useState, type FormEvent } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import type { UserProfile } from '../types'
import TrustedIpSettings from './TrustedIpSettings'

interface SettingsPageProps {
  userProfile?: UserProfile
  onUpdateProfile?: (updated: UserProfile) => void
  defaultTab?: 'profile' | 'services' | 'security'
}

const defaultUser: UserProfile = {
  name: 'Mayes',
  handle: 'owner@bambooleaf.eth',
  email: 'mayes@bambooleaf.eth',
  walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  role: 'Primary Signer · Workspace Owner',
  avatarColor: 'from-[#65A30D] to-[#84CC16]',
  bio: 'Guarded agent workspace administrator and signer on Sepolia testnet.',
  telegram: '@mayes_guard',
  cardName: 'MAYES · OWNER',
}

const avatarColorOptions = [
  { name: 'Bamboo Lime', class: 'from-[#65A30D] to-[#84CC16]' },
  { name: 'Emerald', class: 'from-emerald-600 to-teal-400' },
  { name: 'Ocean Cyan', class: 'from-cyan-600 to-blue-500' },
  { name: 'Royal Violet', class: 'from-purple-600 to-indigo-500' },
  { name: 'Amber Gold', class: 'from-amber-500 to-orange-400' },
]

export default function SettingsPage({
  userProfile = defaultUser,
  onUpdateProfile,
  defaultTab = 'profile',
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'services' | 'security'>(defaultTab)

  // Profile Form State
  const [name, setName] = useState(userProfile.name)
  const [handle, setHandle] = useState(userProfile.handle)
  const [email, setEmail] = useState(userProfile.email)
  const [telegram, setTelegram] = useState(userProfile.telegram)
  const [bio, setBio] = useState(userProfile.bio)
  const [avatarColor, setAvatarColor] = useState(userProfile.avatarColor)
  const [cardName, setCardName] = useState(userProfile.cardName || `${userProfile.name.toUpperCase()} · OWNER`)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSaveProfile = (e: FormEvent) => {
    e.preventDefault()
    const updated: UserProfile = {
      ...userProfile,
      name,
      handle,
      email,
      telegram,
      bio,
      avatarColor,
      cardName,
    }
    onUpdateProfile?.(updated)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(userProfile.walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Workspace & Account"
        title="Settings & Profile"
        description="Manage your guarded operator identity, connected services, and default policies."
      />

      {/* Settings Tab Bar */}
      <div className="flex border-b border-slate-200/80 dark:border-slate-800 gap-2 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 pb-3 px-1 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'profile'
              ? 'border-[#84CC16] text-slate-900 dark:text-white'
              : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Icon name="user" size={16} />
          <span>User Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2 pb-3 px-1 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'services'
              ? 'border-[#84CC16] text-slate-900 dark:text-white'
              : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Icon name="bolt" size={16} />
          <span>Connected Services</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 pb-3 px-1 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-[#84CC16] text-slate-900 dark:text-white'
              : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Icon name="shield" size={16} />
          <span>Security Defaults</span>
        </button>
      </div>

      {/* TAB 1: USER PROFILE */}
      {activeTab === 'profile' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {savedSuccess && (
            <div className="p-4 rounded-2xl bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/50 text-[#4D7C0F] dark:text-lime-300 text-xs font-bold flex items-center gap-2">
              <Icon name="checkCircle" size={16} />
              <span>Profile details updated successfully!</span>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            {/* Edit Profile Form Card */}
            <Card className="p-6 sm:p-7 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Operator Profile</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Your personal identity and alert channels.</p>
                </div>
                <Badge tone="green">Primary Signer</Badge>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                {/* Avatar Color Picker */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Avatar Theme Color
                  </label>
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${avatarColor} text-white font-black text-xl flex items-center justify-center shrink-0 shadow-md ring-2 ring-white dark:ring-slate-800`}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {avatarColorOptions.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => setAvatarColor(opt.class)}
                          className={`w-7 h-7 rounded-full bg-gradient-to-tr ${opt.class} transition-all ${
                            avatarColor === opt.class
                              ? 'ring-4 ring-[#84CC16]/40 scale-110 shadow-sm'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                          title={opt.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Name & ENS */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-[#84CC16] focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      ENS / Identity Handle
                    </label>
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-[#84CC16] focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>
                </div>

                {/* Cardholder Name (Synced across Wallet & Overview cards) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cardholder Name on Smart Cards
                    </label>
                    <span className="text-[10px] font-mono text-[#65A30D] dark:text-lime-400 font-bold bg-lime-50 dark:bg-lime-950/60 px-2 py-0.5 rounded-full">
                      Syncs with Overview & Wallet Cards
                    </span>
                  </div>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    placeholder="e.g. MAYES · OWNER"
                    required
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono font-bold tracking-wider text-slate-800 dark:text-slate-100 outline-none focus:border-[#84CC16] focus:ring-2 focus:ring-lime-500/20"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    This exact name is laser-etched onto your physical Titanium Vault card in the Wallet section and your BambooLeaf card in Overview.
                  </p>
                </div>

                {/* Contact & Alerts */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Security Alert Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-[#84CC16] focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Telegram Emergency Alert
                    </label>
                    <input
                      type="text"
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder="@username"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-[#84CC16] focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>
                </div>

                {/* Bio / Workspace Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Workspace Mission & Bio
                  </label>
                  <textarea
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#84CC16] focus:ring-2 focus:ring-lime-500/20 resize-none leading-relaxed"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-6 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
                  >
                    Save profile changes
                  </button>
                </div>
              </form>
            </Card>

            {/* Account Credentials & Wallet Card */}
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Signer Credentials</h3>
                  <Badge tone="green">Verified</Badge>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Testnet Address</span>
                    <span className="font-bold text-[#65A30D] dark:text-lime-400">Sepolia</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {userProfile.walletAddress}
                    </span>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 transition"
                      title="Copy full address"
                    >
                      <Icon name={copied ? 'check' : 'copy'} size={14} className={copied ? 'text-[#65A30D]' : ''} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">Signer Authority</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Owner Keypair</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="text-slate-500 dark:text-slate-400">Enforced Autonomy</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Level 2 (Standard)</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-500 dark:text-slate-400">Active Sessions</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">1 Primary Device</span>
                  </div>
                </div>
              </Card>

              {/* Safety badge reminder */}
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-amber-900 dark:text-amber-300 text-xs flex gap-3">
                <Icon name="shield" size={17} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Signer private keys are never exposed to the client or stored in localStorage. All critical policy mutations require human confirmation.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONNECTED SERVICES */}
      {activeTab === 'services' && (
        <div className="grid gap-6 xl:grid-cols-2 animate-in fade-in duration-200">
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Connected services</h2>
            <p className="text-xs text-slate-400 mb-4">Connection status from current application</p>
            <div className="space-y-3">
              {[
                { name: 'Backend API', status: 'Configured by environment', ok: true },
                { name: 'MongoDB', status: 'Server-side connection', ok: true },
                { name: 'Planner model', status: 'Provider credentials active', ok: true },
                { name: 'Signer', status: 'Server-side only · never exposed to client', ok: true },
              ].map((item) => (
                <div key={item.name} className="flex items-center gap-3 border-t border-slate-100 dark:border-slate-800/80 py-3 first:border-0">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.ok ? 'bg-[#84CC16]' : 'bg-amber-400'}`} />
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                    <p className="text-[10px] text-slate-400">{item.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: SECURITY DEFAULTS */}
      {activeTab === 'security' && (
        <div className="grid gap-6 xl:grid-cols-2 animate-in fade-in duration-200">
          <TrustedIpSettings />
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Security defaults</h2>
            <p className="text-xs text-slate-400 mb-4">The UI never receives signer secrets</p>
            <div className="space-y-3">
              {[
                'Keys remain server-side in environment variables',
                'Untrusted prompt text cannot bypass guard policy',
                'Arena should use isolated fake funds only',
                'All activity should be recorded in the audit chain',
              ].map((item) => (
                <div key={item} className="flex gap-2.5 border-t border-slate-100 dark:border-slate-800/80 pt-3 first:border-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Icon name="lock" size={14} className="text-[#65A30D] dark:text-lime-400 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
