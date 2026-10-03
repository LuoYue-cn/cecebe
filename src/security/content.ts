import { AppError } from "@/lib/errors";
import type { Settings } from "@/lib/settings";
import type { TestSchema } from "@/schemas/test";
export function sensitivity(text: string): TestSchema["sensitivity"] {
  text = text.replace(
    /不代表(?:专业|医疗|临床)?诊断|不用于(?:专业|医疗|临床)?诊断|not (?:a )?(?:medical |professional )?diagnosis/gi,
    "",
  );
  if (/诊断|疾病|抑郁症|自杀|自残|diagnos|suicid|medical disorder/i.test(text))
    return "high_risk";
  if (
    /性取向|信仰|宗教|心理|政治|私密|sexual orientation|religio|mental health|politic/i.test(
      text,
    )
  )
    return "sensitive";
  return "normal";
}
export function schemaModerationText(schema: TestSchema) {
  return [
    schema.title,
    schema.description,
    ...schema.dimensions.map((d) => `${d.name} ${d.description}`),
    ...schema.questions.flatMap((q) => [
      q.text,
      ...q.options.map((o) => o.text),
    ]),
  ].join("\n");
}
export function enforceContent(
  text: string,
  config: Settings,
  level?: TestSchema["sensitivity"],
) {
  const detected = sensitivity(text);
  const ranked = { normal: 0, sensitive: 1, high_risk: 2 };
  const effective =
    level && ranked[level] > ranked[detected] ? level : detected;
  if (
    config.moderation &&
    config.sensitiveWords.some((word) =>
      text.toLowerCase().includes(word.toLowerCase()),
    )
  )
    throw new AppError(400, "该主题不符合站点内容规则。");
  if (effective === "high_risk" && !config.allowHighRisk)
    throw new AppError(400, "本站暂不支持医疗诊断或其他高风险测试。");
  if (effective === "sensitive" && !config.allowSensitive)
    throw new AppError(400, "本站暂不开放敏感主题测试。");
  return effective;
}
