package com.mynikatech.memgine.component.product

import com.mynikatech.memgine.exception.*
import com.mynikatech.memgine.net.dto.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException

class OrganizationProductService(private val jdbi:Jdbi) {
 private val json=Json { encodeDefaults=true }
 fun catalogs(org:String, actor:String)=withSql(org,actor){ it.catalogs(org,actor) }
 fun products(org:String, search:String?, actor:String)=withSql(org,actor){ it.products(org,search?.trim()?.takeIf(String::isNotEmpty),actor) }
 fun saveCatalog(org:String, request:OrganizationProductCatalogWriteDto, actor:String):OrganizationProductCatalogDto {
   validateOrg(org); if(request.catalogName.isBlank()) throw BadRequestException("Catalog name is required")
   val id=withSql(org,actor){ it.saveCatalog(OrganizationProductCatalogParams(org,request.productCatalogId,request.integrationConfigurationId,request.catalogName.trim(),request.description?.trim(),request.externalCatalogId?.trim(),request.active,request.versionNo,actor)) }
   return catalogs(org,actor).first { it.productCatalogId==id }
 }
 fun saveProduct(org:String, request:OrganizationProductWriteDto, actor:String):OrganizationProductDto {
   validateOrg(org); if(request.productCode.isBlank()||request.productName.isBlank()||request.basePriceMinor<0||request.currencyCode.length!=3) throw BadRequestException("Invalid product fields")
   val id=withSql(org,actor){ it.saveProduct(OrganizationProductParams(org,request.productId,request.productCatalogId,request.productCatalogCategoryId,request.productCode.trim(),request.productName.trim(),request.description?.trim(),request.shortCode?.trim(),request.sku?.trim(),request.upc?.trim(),request.basePriceMinor,request.currencyCode.trim(),request.active,request.externalProductId?.trim(),request.versionNo,actor)) }
   return products(org,null,actor).first { it.productId==id }
 }
 fun preview(org:String, request:ProductImportRequestDto, actor:String):List<ProductImportPreviewDto> = withSql(org,actor) {
   if(request.rows.isEmpty()) throw BadRequestException("The import has no rows")
   it.preview(org,request.productCatalogId,json.encodeToString(request.rows),actor)
 }
 fun commit(org:String, request:ProductImportRequestDto, actor:String):ProductImportCommitDto = withSql(org,actor) {
   if(request.rows.isEmpty()) throw BadRequestException("The import has no rows")
   it.commit(org,request.productCatalogId,request.fileName,json.encodeToString(request.rows),actor)
 }
 private fun <T> withSql(org:String,actor:String, block:(OrganizationProductSql)->T):T {
   validateOrg(org); val sql=jdbi.onDemand(OrganizationProductSql::class.java)
   if(!sql.canAdminister(org,actor)) throw ForbiddenException("Organization access denied")
   return try { block(sql) } catch(e:Exception){ translate(e) }
 }
 private fun validateOrg(value:String){if(value.isBlank()||value.length>64) throw BadRequestException("Invalid organization")}
 private fun translate(error:Exception):Nothing { var c:Throwable?=error; while(c!=null){if(c is PSQLException) when(c.sqlState){"42501"->throw ForbiddenException("Organization access denied");"23505","40001"->throw ConflictException("Product catalog data changed; refresh and retry");"22023","22001","23502","23503","23514"->throw BadRequestException(c.message?.substringAfter("ERROR: ")?:"Invalid product catalog data")};c=c.cause};throw error }
}
