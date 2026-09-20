// Bottom band: ACT ONLY, and never covered by anything.
//
// HOLDING and PRE/POST are the largest targets on the screen and sit bottom-left
// where a hand already rests. They are the recovery path: when something has
// gone wrong and a volunteer is frightened, these are what they reach for.
//
// Nothing destructive lives here. No Store, no Delete, no Load. And nothing here
// is ever disabled — an unreachable link does not mean the desk stopped taking
// commands, and being told "no" by a greyed-out HOLDING button at the exact
// moment you need it is the worst possible behaviour.

type Action = { key: string; label: string; wide?: boolean }

const ACTIONS: Action[] = [
	{ key: 'prepost', label: 'PRE / POST', wide: true },
	{ key: 'holding', label: 'HOLDING', wide: true },
	{ key: 'haze', label: 'HAZE' },
	{ key: 'fade', label: 'FADE' },
	{ key: 'recover', label: 'RECOVER' },
]

export function BottomRail({ onAct }: { onAct: (label: string) => void }) {
	return (
		<footer className="grid grid-cols-[3fr_3fr_2fr_2fr_2fr] gap-px border-t-2 border-booth-edge bg-booth-edge">
			{ACTIONS.map((a) => (
				<button
					key={a.key}
					type="button"
					onClick={() => onAct(a.label)}
					className={`h-28 bg-booth-panel font-semibold tracking-widest active:scale-[0.99] ${
						a.wide === true ? 'text-2xl' : 'text-base text-booth-dim'
					}`}
				>
					{a.label}
				</button>
			))}
		</footer>
	)
}
