-- Register the workflow without exposing an incomplete financial operation.
INSERT INTO "${schemaName}".refund_resolution_options
 (option_type,option_code,display_name,description,scope,display_order,is_active)
VALUES ('ACTION','REFUND_AND_CANCEL','Refund and cancel membership',
 'Refund the selected purchase, then cancel its linked membership only after verified refund success.',
 'BOTH',25,FALSE)
ON CONFLICT (option_type,option_code,scope) DO UPDATE
SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,
    display_order=EXCLUDED.display_order,is_active=FALSE;
