import { Input, Select, Textarea } from '@ensemble-sheets/react'
import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta<typeof Input> = {
  title: 'UI / Input',
  component: Input,
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    invalid: { control: 'boolean' },
  },
}
export default meta

type Story = StoryObj<typeof Input>

export const Default: Story = { args: { placeholder: '搜索工作簿…' } }
export const Invalid: Story = {
  args: { placeholder: 'email', invalid: true, defaultValue: 'not-an-email' },
}

export const SelectStory: StoryObj = {
  name: 'Select',
  render: () => (
    <Select defaultValue="编辑">
      <option>查看</option>
      <option>编辑</option>
      <option>管理</option>
    </Select>
  ),
}

export const TextareaStory: StoryObj = {
  name: 'Textarea',
  render: () => <Textarea rows={4} placeholder="备注…" />,
}
