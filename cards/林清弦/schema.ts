export const Schema = z.object({
  系统: z.object({
    时间: z.string(),
    地点: z.string(),
    在场人物: z.array(z.string()),
  }),

  林清弦: z.object({
    当前想法: z.string(),
    短期目标: z.string(),
    长期目标: z.string(),
    好感度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    堕落值: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    与user做爱次数: z.coerce.number().transform(v => Math.max(0, Math.floor(v))),
    秘密暴露风险值: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    身体性器状态: z.object({
      整体淫乱度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      当前性欲: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      胸部: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string(),
      }),
      阴部: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string(),
      }),
      阴蒂: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string(),
      }),
      子宫: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string(),
      }),
      后庭: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string(),
      }),
      口腔: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string(),
      }),
    }),
  }),

  沈景明: z.object({
    怀疑度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    当前状态: z.string(),
  }),
});

export type Schema = z.output<typeof Schema>;