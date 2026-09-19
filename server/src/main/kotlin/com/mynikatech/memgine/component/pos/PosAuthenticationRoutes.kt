package com.mynikatech.memgine.component.pos

import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.*
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.Cookie
import io.ktor.http.HttpHeaders
import io.ktor.server.application.*
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.posAuthenticationRoutes(service: PosAuthenticationService, config: AuthenticationConfig) {
 route("/organizations/{organizationId}") {
  route("/pos-devices") {
   get { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.list(org,call.authenticatedPrincipal().userId),call.callId)) }
   post { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); val (device,token)=service.register(org,call.receive(),call.authenticatedPrincipal().userId); call.setPosCookie(config,token); call.respond(ApiResponse.success(device,call.callId)) }
   delete("/{deviceId}") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); val id=call.parameters["deviceId"]?:throw BadRequestException("Device id is required"); val current=call.request.cookies[config.posDeviceCookieName]?.let { runCatching { service.context(it).deviceId }.getOrNull() }; val result=service.revoke(org,id,call.authenticatedPrincipal().userId); if(current==id) call.clearPosCookie(config); call.respond(ApiResponse.success(mapOf("revoked" to result),call.callId)) }
  }
  put("/staff/{staffId}/pos-pin") { val org=call.parameters["organizationId"]?:throw BadRequestException("Organization id is required"); val staff=call.parameters["staffId"]?:throw BadRequestException("Staff id is required"); call.respond(ApiResponse.success(mapOf("updated" to service.setPin(org,staff,call.receive<SetStaffPosPinRequest>().pin,call.authenticatedPrincipal().userId)),call.callId)) }
 }
 route("/pos") {
  get("/context") { call.respond(ApiResponse.success(service.context(call.request.cookies[config.posDeviceCookieName]),call.callId)) }
  post("/unlock") { val unlocked=service.unlock(call.request.cookies[config.posDeviceCookieName],call.receive(),call.clientIp(),call.request.headers[HttpHeaders.UserAgent]); call.setUserCookie(config,unlocked.token); call.respond(ApiResponse.success(unlocked.dto,call.callId)) }
 }
}
private fun ApplicationCall.clientIp()=request.headers["X-Forwarded-For"]?.substringBefore(',')?.trim()?:request.headers["X-Real-IP"]?.trim()
private fun ApplicationCall.setPosCookie(c:AuthenticationConfig,token:String)=response.cookies.append(Cookie(c.posDeviceCookieName,token,path="/",maxAge=(c.posDeviceCookieDays*86400).coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),secure=c.secureCookie,httpOnly=true,extensions=mapOf("SameSite" to "Lax")))
private fun ApplicationCall.setUserCookie(c:AuthenticationConfig,token:String)=response.cookies.append(Cookie(c.cookieName,token,path="/",maxAge=(c.sessionDurationMinutes*60).toInt(),secure=c.secureCookie,httpOnly=true,extensions=mapOf("SameSite" to "Lax")))
private fun ApplicationCall.clearPosCookie(c:AuthenticationConfig)=response.cookies.append(Cookie(c.posDeviceCookieName,"",path="/",maxAge=0,secure=c.secureCookie,httpOnly=true,extensions=mapOf("SameSite" to "Lax")))
