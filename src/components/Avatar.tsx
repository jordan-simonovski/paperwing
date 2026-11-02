/** Your face, or your initial: the top bar's way to your profile. */
export function Avatar({ avatar, handle, size = 24 }: { avatar?: string; handle: string; size?: number }) {
  return avatar ? (
    <img src={avatar} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full bg-sunk text-[0.75rem] font-bold text-ink-2" style={{ width: size, height: size }}>
      {handle[0]?.toUpperCase()}
    </span>
  )
}
