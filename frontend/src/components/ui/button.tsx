import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700', {
  variants: { variant: { default: 'btn-primary bg-[#164d42] text-white hover:bg-[#103c33]', outline: 'border border-[#dce3df] bg-white text-[#263c34] hover:bg-[#f4f7f5]', ghost: 'text-[#566a61] hover:bg-[#edf2ee]', destructive: 'btn-primary bg-[#b1463a] text-white hover:bg-[#943a30]' }, size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs' } },
  defaultVariants: { variant: 'default', size: 'default' },
})
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }
export function Button({ className, variant, size, asChild = false, ...props }: Props) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
