package com.mynikatech.memgine.component.product

import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.customizer.BindBean
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class OrganizationProductCatalogParams(val organizationId:String,val productCatalogId:String?,val integrationConfigurationId:String?,val catalogName:String,val description:String?,val externalCatalogId:String?,val active:Boolean,val versionNo:Int?,val actorUserId:String)
data class OrganizationProductParams(val organizationId:String,val productId:String?,val productCatalogId:String,val productCatalogCategoryId:String?,val productCode:String,val productName:String,val description:String?,val shortCode:String?,val sku:String?,val upc:String?,val basePriceMinor:Long,val currencyCode:String,val active:Boolean,val externalProductId:String?,val versionNo:Int?,val actorUserId:String)
interface OrganizationProductSql {
 @SqlQuery("SELECT can_administer_organization(:organizationId,:actorUserId)") fun canAdminister(@Bind("organizationId") organizationId:String,@Bind("actorUserId") actorUserId:String):Boolean
 @SqlQuery("SELECT * FROM get_organization_product_catalogs_admin(:organizationId,:actorUserId)") fun catalogs(@Bind("organizationId") organizationId:String,@Bind("actorUserId") actorUserId:String):List<OrganizationProductCatalogDto>
 @SqlQuery("SELECT save_organization_product_catalog(:organizationId,:productCatalogId,:integrationConfigurationId,:catalogName,:description,:externalCatalogId,:active,:versionNo,:actorUserId)") fun saveCatalog(@BindBean p:OrganizationProductCatalogParams):String
 @SqlQuery("SELECT * FROM get_organization_products_admin(:organizationId,:search,:actorUserId)") fun products(@Bind("organizationId") organizationId:String,@Bind("search") search:String?,@Bind("actorUserId") actorUserId:String):List<OrganizationProductDto>
 @SqlQuery("SELECT save_organization_product(:organizationId,:productId,:productCatalogId,:productCatalogCategoryId,:productCode,:productName,:description,:shortCode,:sku,:upc,:basePriceMinor,:currencyCode,:active,:externalProductId,:versionNo,:actorUserId)") fun saveProduct(@BindBean p:OrganizationProductParams):String
 @SqlQuery("SELECT * FROM preview_organization_product_import(:organizationId,:catalogId,CAST(:rows AS jsonb),:actorUserId)") fun preview(@Bind("organizationId") organizationId:String,@Bind("catalogId") catalogId:String,@Bind("rows") rows:String,@Bind("actorUserId") actorUserId:String):List<ProductImportPreviewDto>
 @SqlQuery("SELECT * FROM commit_organization_product_import(:organizationId,:catalogId,:fileName,CAST(:rows AS jsonb),:actorUserId)") fun commit(@Bind("organizationId") organizationId:String,@Bind("catalogId") catalogId:String,@Bind("fileName") fileName:String,@Bind("rows") rows:String,@Bind("actorUserId") actorUserId:String):ProductImportCommitDto
}
