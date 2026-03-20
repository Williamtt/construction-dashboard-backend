import type { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors.js'
import {
  selfInspectionTemplateRepository,
  selfInspectionBlockRepository,
  selfInspectionBlockItemRepository,
  type SelfInspectionTemplateRow,
  type SelfInspectionBlockWithItems,
  type SelfInspectionBlockItemRow,
} from './self-inspection-template.repository.js'
import {
  headerConfigSchema,
  mergeHeaderConfig,
  type HeaderConfig,
  type CreateSelfInspectionTemplateBody,
  type UpdateSelfInspectionTemplateBody,
  type CreateSelfInspectionBlockBody,
  type UpdateSelfInspectionBlockBody,
  type CreateSelfInspectionBlockItemBody,
  type UpdateSelfInspectionBlockItemBody,
} from '../../schemas/self-inspection-template.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function resolveTenantId(user: AuthUser, explicitTenantId?: string | null): string {
  const tid = explicitTenantId?.trim() || user.tenantId
  if (!tid) {
    throw new AppError(400, 'BAD_REQUEST', '請提供 tenantId 或使用具租戶的帳號')
  }
  if (user.systemRole !== 'platform_admin' && user.tenantId !== tid) {
    throw new AppError(403, 'FORBIDDEN', '無法存取其他租戶的自主檢查樣板')
  }
  return tid
}

async function getTemplateForTenant(
  templateId: string,
  tenantId: string
): Promise<SelfInspectionTemplateRow> {
  const row = await selfInspectionTemplateRepository.findById(templateId)
  if (!row || row.tenantId !== tenantId) {
    throw new AppError(404, 'NOT_FOUND', '找不到該自主檢查樣板')
  }
  return row
}

async function assertBlockBelongsToTemplate(blockId: string, templateId: string) {
  const block = await selfInspectionBlockRepository.findById(blockId)
  if (!block || block.templateId !== templateId) {
    throw new AppError(404, 'NOT_FOUND', '找不到該區塊')
  }
  return block
}

function toTemplateListDto(row: SelfInspectionTemplateRow & { _count?: { blocks: number } }) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    status: row.status,
    blockCount: row._count?.blocks ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toTemplateDetailDto(row: SelfInspectionTemplateRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    status: row.status,
    headerConfig: mergeHeaderConfig(row.headerConfig) as HeaderConfig,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toItemDto(row: SelfInspectionBlockItemRow) {
  return {
    id: row.id,
    blockId: row.blockId,
    categoryLabel: row.categoryLabel,
    itemName: row.itemName,
    standardText: row.standardText,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toBlockWithItemsDto(row: SelfInspectionBlockWithItems) {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map(toItemDto),
  }
}

export const selfInspectionTemplateService = {
  async list(
    user: AuthUser,
    query: { tenantId?: string; status?: string }
  ): Promise<ReturnType<typeof toTemplateListDto>[]> {
    const tenantId = resolveTenantId(user, query.tenantId ?? null)
    const rows = await selfInspectionTemplateRepository.findManyByTenant(tenantId, {
      status: query.status,
    })
    return rows.map((r) => toTemplateListDto(r))
  },

  async getById(
    user: AuthUser,
    templateId: string,
    queryTenantId?: string | null
  ): Promise<{
    template: ReturnType<typeof toTemplateDetailDto> & { blockCount: number }
    blocks: ReturnType<typeof toBlockWithItemsDto>[]
  }> {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    const template = await getTemplateForTenant(templateId, tenantId)
    const blocks = await selfInspectionBlockRepository.findManyByTemplateIdWithItems(templateId)
    return {
      template: {
        ...toTemplateDetailDto(template),
        blockCount: blocks.length,
      },
      blocks: blocks.map(toBlockWithItemsDto),
    }
  },

  async create(
    user: AuthUser,
    body: CreateSelfInspectionTemplateBody,
    bodyTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, bodyTenantId ?? null)
    let headerConfig: Prisma.InputJsonValue | undefined
    if (body.headerConfig != null) {
      headerConfig = headerConfigSchema.parse(body.headerConfig) as Prisma.InputJsonValue
    }
    const row = await selfInspectionTemplateRepository.create({
      tenantId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      status: body.status ?? 'active',
      ...(headerConfig !== undefined ? { headerConfig } : {}),
    })
    return {
      ...toTemplateListDto(row),
      headerConfig: mergeHeaderConfig(row.headerConfig) as HeaderConfig,
    }
  },

  async update(
    user: AuthUser,
    templateId: string,
    body: UpdateSelfInspectionTemplateBody,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    let headerConfig: Prisma.InputJsonValue | undefined
    if (body.headerConfig !== undefined) {
      headerConfig = headerConfigSchema.parse(body.headerConfig) as Prisma.InputJsonValue
    }
    const row = await selfInspectionTemplateRepository.update(templateId, {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(headerConfig !== undefined && { headerConfig }),
    })
    const blockCount = await selfInspectionBlockRepository.countByTemplateId(templateId)
    return {
      ...toTemplateListDto({ ...row, _count: { blocks: blockCount } }),
      headerConfig: mergeHeaderConfig(row.headerConfig) as HeaderConfig,
    }
  },

  async delete(user: AuthUser, templateId: string, queryTenantId?: string | null) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    await selfInspectionTemplateRepository.delete(templateId, user.id)
  },

  async createBlock(
    user: AuthUser,
    templateId: string,
    body: CreateSelfInspectionBlockBody,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    const nextOrder = (await selfInspectionBlockRepository.maxSortOrder(templateId)) + 1
    const row = await selfInspectionBlockRepository.create({
      templateId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      sortOrder: nextOrder,
    })
    return toBlockWithItemsDto({ ...row, items: [] })
  },

  async updateBlock(
    user: AuthUser,
    templateId: string,
    blockId: string,
    body: UpdateSelfInspectionBlockBody,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    await assertBlockBelongsToTemplate(blockId, templateId)
    const row = await selfInspectionBlockRepository.update(blockId, {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    })
    const items = await selfInspectionBlockRepository.findManyByTemplateIdWithItems(templateId)
    const full = items.find((b) => b.id === row.id)
    return toBlockWithItemsDto(full ?? { ...row, items: [] })
  },

  async deleteBlock(
    user: AuthUser,
    templateId: string,
    blockId: string,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    await assertBlockBelongsToTemplate(blockId, templateId)
    await selfInspectionBlockRepository.delete(blockId, user.id)
  },

  async createBlockItem(
    user: AuthUser,
    templateId: string,
    blockId: string,
    body: CreateSelfInspectionBlockItemBody,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    await assertBlockBelongsToTemplate(blockId, templateId)
    const nextOrder = (await selfInspectionBlockItemRepository.maxSortOrder(blockId)) + 1
    const row = await selfInspectionBlockItemRepository.create({
      blockId,
      categoryLabel: body.categoryLabel.trim(),
      itemName: body.itemName.trim(),
      standardText: body.standardText.trim(),
      sortOrder: nextOrder,
    })
    return toItemDto(row)
  },

  async updateBlockItem(
    user: AuthUser,
    templateId: string,
    blockId: string,
    itemId: string,
    body: UpdateSelfInspectionBlockItemBody,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    await assertBlockBelongsToTemplate(blockId, templateId)
    const existing = await selfInspectionBlockItemRepository.findById(itemId)
    if (!existing || existing.blockId !== blockId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該查驗項目')
    }
    const row = await selfInspectionBlockItemRepository.update(itemId, {
      ...(body.categoryLabel !== undefined && { categoryLabel: body.categoryLabel.trim() }),
      ...(body.itemName !== undefined && { itemName: body.itemName.trim() }),
      ...(body.standardText !== undefined && { standardText: body.standardText.trim() }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    })
    return toItemDto(row)
  },

  async deleteBlockItem(
    user: AuthUser,
    templateId: string,
    blockId: string,
    itemId: string,
    queryTenantId?: string | null
  ) {
    const tenantId = resolveTenantId(user, queryTenantId ?? null)
    await getTemplateForTenant(templateId, tenantId)
    await assertBlockBelongsToTemplate(blockId, templateId)
    const existing = await selfInspectionBlockItemRepository.findById(itemId)
    if (!existing || existing.blockId !== blockId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該查驗項目')
    }
    await selfInspectionBlockItemRepository.delete(itemId, user.id)
  },
}
