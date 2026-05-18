import { ChartPanel } from '@ensemble-sheets/react'
import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta<typeof ChartPanel> = {
  title: 'Workbook / ChartPanel',
  component: ChartPanel,
  argTypes: {
    kind: { control: 'select', options: ['bar', 'line', 'pie'] },
  },
}
export default meta

type Story = StoryObj<typeof ChartPanel>

const sampleData = {
  series: [
    {
      label: 'Q1',
      points: [
        { x: '北区', y: 120 },
        { x: '南区', y: 90 },
        { x: '东区', y: 150 },
      ],
    },
    {
      label: 'Q2',
      points: [
        { x: '北区', y: 200 },
        { x: '南区', y: 110 },
        { x: '东区', y: 170 },
      ],
    },
  ],
}

export const Bar: Story = { args: { kind: 'bar', data: sampleData, title: '区域销量' } }
export const Line: Story = { args: { kind: 'line', data: sampleData, title: '趋势' } }
export const Pie: Story = { args: { kind: 'pie', data: sampleData, title: '占比' } }
export const Empty: Story = { args: { kind: 'bar', data: { series: [] }, title: '无数据' } }
