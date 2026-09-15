package com.mynikatech.memgine.component.store
import kotlinx.serialization.Serializable
@Serializable data class UpsertStoreRequest(val id:String,val code:String,val name:String,val storeTypeId:String,val phoneNumber:String?=null,val emailAddress:String?=null,val addressLine1:String,val addressLine2:String?=null,val city:String,val state:String,val postalCode:String,val country:String,val timezone:String,val storeStatusId:String?=null,val openingDate:String?=null,val closingDate:String?=null,val actorUserId:String)
