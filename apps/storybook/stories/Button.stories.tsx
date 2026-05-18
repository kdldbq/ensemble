import { Button } from '@ensemble-sheets/react'
import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta<typeof Button> = {
  title: 'UI / Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { variant: 'primary', children: '保存' } }
export const Secondary: Story = { args: { variant: 'secondary', children: '取消' } }
export const Danger: Story = { args: { variant: 'danger', children: '删除' } }
export const Ghost: Story = { args: { variant: 'ghost', children: '更多' } }
export const Disabled: Story = { args: { variant: 'primary', disabled: true, children: '保存' } }
